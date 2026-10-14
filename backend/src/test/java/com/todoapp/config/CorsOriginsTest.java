package com.todoapp.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

class CorsOriginsTest {

    @Test
    void trimsDropsBlanksAndKeepsPatterns() {
        List<String> origins = SecurityConfig.parseAllowedOrigins(
                " https://a.vercel.app/ , ,https://b-*-t.vercel.app");
        assertThat(origins).containsExactly("https://a.vercel.app", "https://b-*-t.vercel.app");
    }

    @Test
    void bareWildcardIsRejected() {
        assertThatThrownBy(() -> SecurityConfig.parseAllowedOrigins("*"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> SecurityConfig.parseAllowedOrigins("https://a.app, * "))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void emptyIsRejected() {
        assertThatThrownBy(() -> SecurityConfig.parseAllowedOrigins(""))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> SecurityConfig.parseAllowedOrigins(" , / ,"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> SecurityConfig.parseAllowedOrigins(null))
                .isInstanceOf(IllegalStateException.class);
    }
}
