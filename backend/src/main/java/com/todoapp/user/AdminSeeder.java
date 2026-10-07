package com.todoapp.user;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Creates the admin account on startup when it does not exist. Never touches an existing admin. */
@Component
public class AdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);
    private static final String DEFAULT_PASSWORD = "admin";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminUsername;
    private final String adminPassword;

    public AdminSeeder(UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.admin.username}") String adminUsername,
            @Value("${app.admin.password}") String adminPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        seed();
    }

    public void seed() {
        if (!userRepository.existsByUsername(adminUsername)) {
            try {
                userRepository.save(new User(adminUsername, "Administrator", passwordEncoder.encode(adminPassword), Role.ADMIN));
                log.info("Seeded admin user '{}'", adminUsername);
            } catch (DataIntegrityViolationException ex) {
                log.info("Admin user '{}' was created concurrently; nothing to seed", adminUsername);
            }
        }
        userRepository.findByUsername(adminUsername)
                .filter(admin -> passwordEncoder.matches(DEFAULT_PASSWORD, admin.getPasswordHash()))
                .ifPresent(admin -> log.warn(
                        "The admin account '{}' still uses the default password. Change it from Profile > Change password.",
                        adminUsername));
    }
}
