package com.todoapp.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UserTest {

    @Test
    void changePasswordReplacesHashAndBumpsTokenVersion() {
        User user = new User("alice_01", "Alice", "oldHash", Role.USER);
        assertThat(user.getTokenVersion()).isZero();

        user.changePassword("newHash");

        assertThat(user.getPasswordHash()).isEqualTo("newHash");
        assertThat(user.getTokenVersion()).isEqualTo(1);

        user.changePassword("newerHash");
        assertThat(user.getTokenVersion()).isEqualTo(2);
    }

    @Test
    void newUserIsEnabled() {
        assertThat(new User("bob_02", "Bob", "hash", Role.USER).isEnabled()).isTrue();
    }
}
