package com.todoapp.task;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.todoapp.security.CurrentUserProvider;
import com.todoapp.task.dto.TaskCompletionRequest;
import com.todoapp.task.dto.TaskCreateRequest;
import com.todoapp.task.dto.TaskResponse;
import com.todoapp.task.dto.TaskUpdateRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;
    private final CurrentUserProvider currentUserProvider;

    public TaskController(TaskService taskService, CurrentUserProvider currentUserProvider) {
        this.taskService = taskService;
        this.currentUserProvider = currentUserProvider;
    }

    private Long currentUserId() {
        return currentUserProvider.getCurrentUser().id();
    }

    @GetMapping
    public List<TaskResponse> list(@RequestParam(required = false) String status,
            @RequestParam(required = false) String q) {
        return taskService.list(currentUserId(), TaskStatusFilter.parse(status), q);
    }

    @GetMapping("/{id}")
    public TaskResponse get(@PathVariable Long id) {
        return taskService.get(currentUserId(), id);
    }

    @PostMapping
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskCreateRequest request) {
        TaskResponse created = taskService.create(currentUserId(), request);
        return ResponseEntity.created(URI.create("/api/tasks/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public TaskResponse update(@PathVariable Long id, @Valid @RequestBody TaskUpdateRequest request) {
        return taskService.update(currentUserId(), id, request);
    }

    @PatchMapping("/{id}/completion")
    public TaskResponse setCompletion(@PathVariable Long id, @Valid @RequestBody TaskCompletionRequest request) {
        return taskService.setCompleted(currentUserId(), id, request.completed());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        taskService.delete(currentUserId(), id);
    }
}
