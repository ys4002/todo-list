package com.todoapp.admin;

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

import com.todoapp.task.TaskService;
import com.todoapp.task.TaskStatusFilter;
import com.todoapp.task.dto.TaskCompletionRequest;
import com.todoapp.task.dto.TaskCreateRequest;
import com.todoapp.task.dto.TaskResponse;
import com.todoapp.task.dto.TaskUpdateRequest;

import jakarta.validation.Valid;

/** Admin access to any user's tasks: checks the user exists, then reuses TaskService with that user's id. */
@RestController
@RequestMapping("/api/admin/users/{userId}/tasks")
public class AdminTaskController {

    private final AdminUserService adminUserService;
    private final TaskService taskService;

    public AdminTaskController(AdminUserService adminUserService, TaskService taskService) {
        this.adminUserService = adminUserService;
        this.taskService = taskService;
    }

    @GetMapping
    public List<TaskResponse> list(@PathVariable Long userId, @RequestParam(required = false) String status,
            @RequestParam(required = false) String q) {
        adminUserService.requireUser(userId);
        return taskService.list(userId, TaskStatusFilter.parse(status), q);
    }

    @GetMapping("/{taskId}")
    public TaskResponse get(@PathVariable Long userId, @PathVariable Long taskId) {
        adminUserService.requireUser(userId);
        return taskService.get(userId, taskId);
    }

    @PostMapping
    public ResponseEntity<TaskResponse> create(@PathVariable Long userId, @Valid @RequestBody TaskCreateRequest request) {
        adminUserService.requireUser(userId);
        TaskResponse created = taskService.create(userId, request);
        return ResponseEntity.created(URI.create("/api/admin/users/" + userId + "/tasks/" + created.id())).body(created);
    }

    @PutMapping("/{taskId}")
    public TaskResponse update(@PathVariable Long userId, @PathVariable Long taskId,
            @Valid @RequestBody TaskUpdateRequest request) {
        adminUserService.requireUser(userId);
        return taskService.update(userId, taskId, request);
    }

    @PatchMapping("/{taskId}/completion")
    public TaskResponse setCompletion(@PathVariable Long userId, @PathVariable Long taskId,
            @Valid @RequestBody TaskCompletionRequest request) {
        adminUserService.requireUser(userId);
        return taskService.setCompleted(userId, taskId, request.completed());
    }

    @DeleteMapping("/{taskId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long userId, @PathVariable Long taskId) {
        adminUserService.requireUser(userId);
        taskService.delete(userId, taskId);
    }
}
