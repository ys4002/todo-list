package com.todoapp.user;

/** A user with the number of tasks they own and how many of those are still open. */
public record UserSummary(User user, long taskCount, long openTaskCount) {
}
