package com.todoapp.task;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.todoapp.common.FieldValidationException;
import com.todoapp.common.ResourceNotFoundException;
import com.todoapp.common.SearchQueryUtils;
import com.todoapp.task.dto.TaskCreateRequest;
import com.todoapp.task.dto.TaskResponse;
import com.todoapp.task.dto.TaskUpdateRequest;

/** Task rules. Every method takes the owner's id, so admin endpoints reuse it with the target user's id. */
@Service
public class TaskService {

    static final String TASK_NOT_FOUND = "Task not found";

    private final TaskRepository taskRepository;
    private final Clock clock;
    private final Duration createGrace;

    public TaskService(TaskRepository taskRepository, Clock clock,
            @Value("${app.task.create-grace-minutes}") long createGraceMinutes) {
        this.taskRepository = taskRepository;
        this.clock = clock;
        this.createGrace = Duration.ofMinutes(createGraceMinutes);
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> list(Long ownerId, TaskStatusFilter status, String query) {
        String pattern = SearchQueryUtils.toLikePattern(query);
        Instant now = clock.instant();
        return taskRepository.search(ownerId, status.completedValue(), pattern, SearchQueryUtils.ESCAPE_CHAR).stream()
                .map(task -> TaskResponse.from(task, now))
                .toList();
    }

    @Transactional(readOnly = true)
    public TaskResponse get(Long ownerId, Long taskId) {
        return TaskResponse.from(find(ownerId, taskId), clock.instant());
    }

    @Transactional
    public TaskResponse create(Long ownerId, TaskCreateRequest request) {
        Instant now = clock.instant();
        if (request.dueAt().isBefore(now.minus(createGrace))) {
            throw new FieldValidationException("dueAt", "Due date and time cannot be in the past");
        }
        Task task = new Task(ownerId, request.title(), blankToNull(request.description()), request.dueAt());
        return TaskResponse.from(taskRepository.saveAndFlush(task), now);
    }

    @Transactional
    public TaskResponse update(Long ownerId, Long taskId, TaskUpdateRequest request) {
        Instant now = clock.instant();
        Task task = find(ownerId, taskId);
        task.setTitle(request.title());
        task.setDescription(blankToNull(request.description()));
        task.setDueAt(request.dueAt());
        task.setCompleted(request.completed(), now);
        return TaskResponse.from(taskRepository.saveAndFlush(task), now);
    }

    @Transactional
    public TaskResponse setCompleted(Long ownerId, Long taskId, boolean completed) {
        Instant now = clock.instant();
        Task task = find(ownerId, taskId);
        task.setCompleted(completed, now);
        return TaskResponse.from(taskRepository.saveAndFlush(task), now);
    }

    @Transactional
    public void delete(Long ownerId, Long taskId) {
        taskRepository.delete(find(ownerId, taskId));
    }

    private Task find(Long ownerId, Long taskId) {
        return taskRepository.findByIdAndUserId(taskId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException(TASK_NOT_FOUND));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
