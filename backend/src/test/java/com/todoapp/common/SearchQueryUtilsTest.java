package com.todoapp.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SearchQueryUtilsTest {

    @Test
    void trimsAndLowerCases() {
        assertThat(SearchQueryUtils.toLikePattern(" Milk ")).isEqualTo("%milk%");
    }

    @Test
    void escapesPercent() {
        assertThat(SearchQueryUtils.toLikePattern("50%")).isEqualTo("%50\\%%");
    }

    @Test
    void escapesUnderscore() {
        assertThat(SearchQueryUtils.toLikePattern("a_b")).isEqualTo("%a\\_b%");
    }

    @Test
    void escapesBackslash() {
        assertThat(SearchQueryUtils.toLikePattern("\\")).isEqualTo("%\\\\%");
    }

    @Test
    void blankOrNullMeansNoFilter() {
        assertThat(SearchQueryUtils.toLikePattern("   ")).isNull();
        assertThat(SearchQueryUtils.toLikePattern("")).isNull();
        assertThat(SearchQueryUtils.toLikePattern(null)).isNull();
    }

    @Test
    void acceptsExactlyMaxLength() {
        assertThat(SearchQueryUtils.toLikePattern("a".repeat(100))).isEqualTo("%" + "a".repeat(100) + "%");
    }

    @Test
    void rejectsTooLongText() {
        assertThatThrownBy(() -> SearchQueryUtils.toLikePattern("a".repeat(101)))
                .isInstanceOfSatisfying(FieldValidationException.class, ex -> {
                    assertThat(ex.getFieldErrors()).hasSize(1);
                    assertThat(ex.getFieldErrors().get(0).field()).isEqualTo("q");
                    assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Search text must be at most 100 characters");
                });
    }
}
