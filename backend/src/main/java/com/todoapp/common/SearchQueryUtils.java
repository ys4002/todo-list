package com.todoapp.common;

import java.util.Locale;

public final class SearchQueryUtils {

    public static final int MAX_LENGTH = 100;
    public static final char ESCAPE_CHAR = '\\';

    private SearchQueryUtils() {
    }

    /**
     * Turns the user's search text into a lower-case LIKE pattern ({@code %text%}) with
     * {@code %}, {@code _} and {@code \} escaped. Returns null when the text is null or blank (no filter).
     */
    public static String toLikePattern(String rawQuery) {
        if (rawQuery == null) {
            return null;
        }
        String trimmed = rawQuery.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MAX_LENGTH) {
            throw new FieldValidationException("q", "Search text must be at most 100 characters");
        }
        String escaped = trimmed.toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
