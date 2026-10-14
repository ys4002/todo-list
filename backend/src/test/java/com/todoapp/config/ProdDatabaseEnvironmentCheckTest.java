package com.todoapp.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

import com.todoapp.TodoApplication;

class ProdDatabaseEnvironmentCheckTest {

    private static final String SECRET = "s3cr3t-Distinct-Pw-9731";

    private final ProdDatabaseEnvironmentCheck check = new ProdDatabaseEnvironmentCheck();
    private final SpringApplication application = new SpringApplication();

    private static MockEnvironment prodEnvironment(String... skipped) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        Map<String, String> all = Map.of(
                "DB_URL", "jdbc:mysql://db-host:3306/x", "DB_USERNAME", "app-user", "DB_PASSWORD", SECRET);
        all.forEach((k, v) -> {
            if (!List.of(skipped).contains(k)) {
                env.setProperty(k, v);
            }
        });
        return env;
    }

    static Stream<String> requiredNames() {
        return ProdDatabaseEnvironmentCheck.REQUIRED.stream();
    }

    @Test
    void allThreeSetPasses() {
        MockEnvironment env = prodEnvironment();

        assertThatCode(() -> check.postProcessEnvironment(env, application)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @MethodSource("requiredNames")
    void missingVariableIsNamedWithoutLeakingValues(String name) {
        MockEnvironment absent = prodEnvironment(name);
        MockEnvironment blank = prodEnvironment(name).withProperty(name, "  ");

        for (MockEnvironment env : List.of(absent, blank)) {
            assertThatThrownBy(() -> check.postProcessEnvironment(env, application))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("Missing required environment variables for the 'prod' profile: " + name)
                    .message().doesNotContain(SECRET).doesNotContain("app-user").doesNotContain("db-host");
        }
    }

    @Test
    void noProfileOrTestProfileDoesNothing() {
        MockEnvironment none = new MockEnvironment();
        MockEnvironment test = new MockEnvironment();
        test.setActiveProfiles("test");

        assertThatCode(() -> check.postProcessEnvironment(none, application)).doesNotThrowAnyException();
        assertThatCode(() -> check.postProcessEnvironment(test, application)).doesNotThrowAnyException();
    }

    @Test
    void bootFailsBeforeAnyDatabaseConnectionWhenPasswordMissing() {
        StandardEnvironment bare = new StandardEnvironment() {
            @Override
            protected void customizePropertySources(org.springframework.core.env.MutablePropertySources sources) {
                // no OS environment, no system properties
            }
        };
        SpringApplicationBuilder builder = new SpringApplicationBuilder(TodoApplication.class)
                .web(WebApplicationType.NONE)
                .environment(bare)
                .profiles("prod")
                .properties("DB_URL=jdbc:mysql://db-host:3306/x", "DB_USERNAME=app-user");

        assertThatThrownBy(() -> builder.run())
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Missing required environment variables for the 'prod' profile: DB_PASSWORD");
    }

    @Test
    void prodYamlHasNoDefaultsForDatabaseSettings() throws IOException {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader()
                .load("application-prod", new ClassPathResource("application-prod.yml"));
        PropertySource<?> prod = sources.get(0);

        assertThat(prod.getProperty("spring.datasource.url")).isEqualTo("${DB_URL}");
        assertThat(prod.getProperty("spring.datasource.username")).isEqualTo("${DB_USERNAME}");
        assertThat(prod.getProperty("spring.datasource.password")).isEqualTo("${DB_PASSWORD}");
    }
}
