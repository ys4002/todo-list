package com.todoapp.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.todoapp.common.FieldValidationException;
import com.todoapp.common.MalformedRequestException;
import com.todoapp.common.ResourceNotFoundException;
import com.todoapp.task.dto.TaskCreateRequest;
import com.todoapp.task.dto.TaskResponse;
import com.todoapp.task.dto.TaskUpdateRequest;

class TaskServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

    private final TaskRepository taskRepository = mock(TaskRepository.class);
    private final TaskService service = new TaskService(taskRepository, Clock.fixed(NOW, ZoneOffset.UTC), 5);

    @BeforeEach
    void setUp() {
        when(taskRepository.saveAndFlush(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private Task taskOwnedBy(long ownerId, long taskId) {
        Task task = new Task(ownerId, "Title", "desc", NOW.plusSeconds(3600));
        ReflectionTestUtils.setField(task, "id", taskId);
        when(taskRepository.findByIdAndUserId(taskId, ownerId)).thenReturn(Optional.of(task));
        return task;
    }

    @Test
    void createRejectsDueDateOlderThanGraceWindow() {
        assertThatThrownBy(() -> service.create(1L, new TaskCreateRequest("t", null, NOW.minusSeconds(600))))
                .isInstanceOfSatisfying(FieldValidationException.class, ex -> {
                    assertThat(ex.getFieldErrors().get(0).field()).isEqualTo("dueAt");
                    assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Due date and time cannot be in the past");
                });
        verify(taskRepository, never()).saveAndFlush(any());
    }

    @Test
    void createAcceptsDueDateInsideGraceWindowAndMarksItOverdue() {
        TaskResponse response = service.create(1L, new TaskCreateRequest("t", null, NOW.minusSeconds(120)));
        assertThat(response.overdue()).isTrue();
        assertThat(response.completed()).isFalse();
    }

    @Test
    void createAcceptsFutureDueDate() {
        TaskResponse response = service.create(1L, new TaskCreateRequest("  t ", "   ", NOW.plusSeconds(3600)));
        assertThat(response.title()).isEqualTo("t");
        assertThat(response.description()).isNull();
        assertThat(response.overdue()).isFalse();
    }

    @Test
    void getUpdateDeleteOfSomeoneElsesTaskIsNotFound() {
        when(taskRepository.findByIdAndUserId(5L, 2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(2L, 5L)).isInstanceOf(ResourceNotFoundException.class).hasMessage("Task not found");
        assertThatThrownBy(() -> service.update(2L, 5L, new TaskUpdateRequest("t", null, NOW, false)))
                .isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.setCompleted(2L, 5L, true)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.delete(2L, 5L)).isInstanceOf(ResourceNotFoundException.class);
        verify(taskRepository, never()).delete(any(Task.class));
    }

    @Test
    void updateAllowsPastDueDateAndSetsCompletedAt() {
        Task task = taskOwnedBy(1L, 9L);

        TaskResponse response = service.update(1L, 9L, new TaskUpdateRequest(" New ", "", NOW.minusSeconds(86400), true));

        assertThat(response.title()).isEqualTo("New");
        assertThat(response.description()).isNull();
        assertThat(response.dueAt()).isEqualTo(NOW.minusSeconds(86400));
        assertThat(response.completed()).isTrue();
        assertThat(response.completedAt()).isEqualTo(NOW);
        assertThat(task.isCompleted()).isTrue();
    }

    @Test
    void completingAnOverdueTaskIsAllowed() {
        Task task = taskOwnedBy(1L, 9L);
        task.setDueAt(NOW.minusSeconds(86400));

        TaskResponse response = service.setCompleted(1L, 9L, true);

        assertThat(response.completed()).isTrue();
        assertThat(response.overdue()).isFalse();
    }

    @Test
    void deleteRemovesOwnedTask() {
        Task task = taskOwnedBy(1L, 9L);
        service.delete(1L, 9L);
        verify(taskRepository).delete(task);
    }

    @Test
    void listPassesStatusAndEscapedPattern() {
        service.list(1L, TaskStatusFilter.ACTIVE, "50%");
        verify(taskRepository).search(eq(1L), eq(false), eq("%50\\%%"), eq('\\'));
        service.list(1L, TaskStatusFilter.ALL, " ");
        verify(taskRepository).search(eq(1L), eq(null), eq(null), eq('\\'));
    }

    @Test
    void statusFilterParsing() {
        assertThat(TaskStatusFilter.parse(null)).isEqualTo(TaskStatusFilter.ALL);
        assertThat(TaskStatusFilter.parse("ACTIVE")).isEqualTo(TaskStatusFilter.ACTIVE);
        assertThat(TaskStatusFilter.parse("completed")).isEqualTo(TaskStatusFilter.COMPLETED);
        assertThatThrownBy(() -> TaskStatusFilter.parse("done")).isInstanceOf(MalformedRequestException.class);
    }
}
