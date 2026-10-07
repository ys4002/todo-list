package com.todoapp.task;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class TaskTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

    private Task newTask(Instant dueAt) {
        return new Task(1L, "Title", null, dueAt);
    }

    @Test
    void completingSetsCompletedAt() {
        Task task = newTask(NOW.plusSeconds(3600));
        task.setCompleted(true, NOW);
        assertThat(task.isCompleted()).isTrue();
        assertThat(task.getCompletedAt()).isEqualTo(NOW);
    }

    @Test
    void uncompletingClearsCompletedAt() {
        Task task = newTask(NOW.plusSeconds(3600));
        task.setCompleted(true, NOW);
        task.setCompleted(false, NOW.plusSeconds(10));
        assertThat(task.isCompleted()).isFalse();
        assertThat(task.getCompletedAt()).isNull();
    }

    @Test
    void completingAgainKeepsOriginalCompletedAt() {
        Task task = newTask(NOW.plusSeconds(3600));
        task.setCompleted(true, NOW);
        task.setCompleted(true, NOW.plusSeconds(60));
        assertThat(task.getCompletedAt()).isEqualTo(NOW);
    }

    @Test
    void staysIncompleteWithoutCompletedAt() {
        Task task = newTask(NOW.plusSeconds(3600));
        task.setCompleted(false, NOW);
        assertThat(task.getCompletedAt()).isNull();
    }

    @Test
    void overdueTaskCanBeCompleted() {
        Task task = newTask(NOW.minusSeconds(86400));
        assertThat(task.isOverdue(NOW)).isTrue();
        task.setCompleted(true, NOW);
        assertThat(task.isCompleted()).isTrue();
        assertThat(task.getCompletedAt()).isEqualTo(NOW);
        assertThat(task.isOverdue(NOW)).isFalse();
    }
}
