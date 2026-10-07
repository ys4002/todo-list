package com.todoapp.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import com.todoapp.task.TaskRepository;

@SpringBootTest
@ActiveProfiles("test")
class AdminSeederTest {

    @Autowired
    private AdminSeeder adminSeeder;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TaskRepository taskRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void cleanDatabase() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
    }

    @AfterEach
    void restoreAdmin() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        adminSeeder.seed();
    }

    @Test
    void seedingTwiceCreatesExactlyOneAdmin() {
        adminSeeder.seed();
        adminSeeder.seed();

        assertThat(userRepository.count()).isEqualTo(1);
        User admin = userRepository.findByUsername("admin").orElseThrow();
        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);
        assertThat(admin.isEnabled()).isTrue();
        assertThat(passwordEncoder.matches("admin", admin.getPasswordHash())).isTrue();
    }

    @Test
    void seedingDoesNotOverwriteChangedPassword() {
        adminSeeder.seed();
        User admin = userRepository.findByUsername("admin").orElseThrow();
        admin.changePassword(passwordEncoder.encode("Ch@nged-Pass1"));
        userRepository.save(admin);
        String hashBefore = userRepository.findByUsername("admin").orElseThrow().getPasswordHash();

        adminSeeder.seed();

        User after = userRepository.findByUsername("admin").orElseThrow();
        assertThat(after.getPasswordHash()).isEqualTo(hashBefore);
        assertThat(passwordEncoder.matches("Ch@nged-Pass1", after.getPasswordHash())).isTrue();
        assertThat(userRepository.count()).isEqualTo(1);
    }
}
