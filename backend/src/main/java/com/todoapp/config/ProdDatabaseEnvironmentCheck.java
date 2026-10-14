package com.todoapp.config;

import java.util.List;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.Profiles;
import org.springframework.util.StringUtils;

/**
 * Fails fast when the {@code prod} profile is active and a database variable is missing or blank.
 * Runs before the context starts, so no database is needed. The message lists names only.
 */
public class ProdDatabaseEnvironmentCheck implements EnvironmentPostProcessor, Ordered {

    static final List<String> REQUIRED = List.of("DB_URL", "DB_USERNAME", "DB_PASSWORD");

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (!environment.acceptsProfiles(Profiles.of("prod"))) {
            return;
        }
        List<String> missing = REQUIRED.stream()
                .filter(name -> !StringUtils.hasText(environment.getProperty(name)))
                .toList();
        if (!missing.isEmpty()) {
            throw new IllegalStateException(
                    "Missing required environment variables for the 'prod' profile: " + String.join(", ", missing));
        }
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
