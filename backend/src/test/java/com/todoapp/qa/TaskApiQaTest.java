package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

/** A17-A46: task CRUD, ordering, filters, validation and edge cases. */
class TaskApiQaTest extends QaSupport {

    private String token;

    @BeforeEach
    void loginAlice() throws Exception {
        token = registerAndLogin(ALICE, ALICE_PASSWORD);
    }

    private List<String> titles(MvcResult list) throws Exception {
        List<String> result = new ArrayList<>();
        for (JsonNode node : body(list)) {
            result.add(node.get("title").asText());
        }
        return result;
    }

    @Test
    void a17_createValidTask() throws Exception {
        MvcResult result = post("/api/tasks", token, taskBody("Buy groceries", "Milk, eggs", isoIn(1, ChronoUnit.HOURS)));
        assertThat(status(result)).isEqualTo(201);
        JsonNode task = body(result);
        assertThat(header(result, "Location")).isEqualTo("/api/tasks/" + task.get("id").asLong());
        assertThat(task.get("completed").asBoolean()).isFalse();
        assertThat(task.get("overdue").asBoolean()).isFalse();
        assertThat(task.get("completedAt").isNull()).isTrue();
        assertThat(task.get("title").asText()).isEqualTo("Buy groceries");
        assertThat(task.get("dueAt").asText()).endsWith("Z");
    }

    @Test
    void a18_createWithoutDescriptionStoresNull() throws Exception {
        MvcResult result = post("/api/tasks", token, map("title", "No desc", "dueAt", isoIn(1, ChronoUnit.HOURS)));
        assertThat(status(result)).isEqualTo(201);
        assertThat(body(result).get("description").isNull()).isTrue();
    }

    @Test
    void a18_blankDescriptionStoredAsNull() throws Exception {
        MvcResult result = post("/api/tasks", token, taskBody("Blank desc", "   ", isoIn(1, ChronoUnit.HOURS)));
        assertThat(status(result)).isEqualTo(201);
        assertThat(body(result).get("description").isNull()).isTrue();
    }

    @Test
    void a19_offsetDueAtNormalisedToUtc() throws Exception {
        String dueAt = Instant.now().plus(30, ChronoUnit.DAYS).truncatedTo(ChronoUnit.DAYS)
                .plus(17, ChronoUnit.HOURS).toString(); // yyyy-MM-ddT17:00:00Z
        String local = dueAt.substring(0, 11) + "22:30:00+05:30";
        MvcResult result = post("/api/tasks", token, taskBody("Offset", null, local));
        assertThat(status(result)).isEqualTo(201);
        assertThat(body(result).get("dueAt").asText()).isEqualTo(dueAt);
        long id = body(result).get("id").asLong();
        String stored = jdbc.queryForObject(
                "SELECT DATE_FORMAT(due_at, '%Y-%m-%dT%H:%i:%sZ') FROM tasks WHERE id = ?", String.class, id);
        assertThat(stored).isEqualTo(dueAt);
    }

    @Test
    void a20_listSortedByDueAtAscending() throws Exception {
        createTask(token, "/api/tasks", "third", null, isoIn(50, ChronoUnit.HOURS));
        createTask(token, "/api/tasks", "first", null, isoIn(32, ChronoUnit.HOURS));
        createTask(token, "/api/tasks", "second", null, isoIn(42, ChronoUnit.HOURS));
        assertThat(titles(get("/api/tasks", token))).containsExactly("first", "second", "third");
    }

    @Test
    void a21_sameDueAtOrderedByCreatedAt() throws Exception {
        String due = isoIn(5, ChronoUnit.HOURS);
        long a = createTask(token, "/api/tasks", "created-first", null, due);
        long b = createTask(token, "/api/tasks", "created-second", null, due);
        jdbc.update("UPDATE tasks SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)), a);
        jdbc.update("UPDATE tasks SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.now().minus(30, ChronoUnit.MINUTES)), b);
        assertThat(titles(get("/api/tasks", token))).containsExactly("created-first", "created-second");
    }

    @Test
    void a22_statusFilterIsCaseInsensitive() throws Exception {
        long open = createTask(token, "open");
        long done = createTask(token, "done");
        patch("/api/tasks/" + done + "/completion", token, map("completed", true));
        assertThat(titles(get("/api/tasks?status=active", token))).containsExactly("open");
        assertThat(titles(get("/api/tasks?status=ACTIVE", token))).containsExactly("open");
        assertThat(titles(get("/api/tasks?status=completed", token))).containsExactly("done");
        assertThat(titles(get("/api/tasks?status=all", token))).hasSize(2);
        assertThat(titles(get("/api/tasks", token))).hasSize(2);
        assertThat(open).isNotEqualTo(done);
    }

    @Test
    void a23_getById() throws Exception {
        long id = createTask(token, "one");
        MvcResult result = get("/api/tasks/" + id, token);
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).get("id").asLong()).isEqualTo(id);
    }

    @Test
    void a24_putUpdatesAllFields() throws Exception {
        long id = createTask(token, "old");
        jdbc.update("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)),
                java.sql.Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)), id);
        String due = isoIn(3, ChronoUnit.DAYS);
        MvcResult result = put("/api/tasks/" + id, token, taskPut("new title", "new desc", due, false));
        assertThat(status(result)).isEqualTo(200);
        JsonNode task = body(result);
        assertThat(task.get("title").asText()).isEqualTo("new title");
        assertThat(task.get("description").asText()).isEqualTo("new desc");
        assertThat(Instant.parse(task.get("dueAt").asText())).isEqualTo(Instant.parse(due));
        assertThat(Instant.parse(task.get("updatedAt").asText()))
                .isAfter(Instant.parse(task.get("createdAt").asText()));
    }

    @Test
    void a25_putCompletedTogglesCompletedAt() throws Exception {
        long id = createTask(token, "toggle");
        String due = isoIn(2, ChronoUnit.DAYS);
        JsonNode done = body(put("/api/tasks/" + id, token, taskPut("toggle", null, due, true)));
        assertThat(done.get("completed").asBoolean()).isTrue();
        assertThat(done.get("completedAt").isNull()).isFalse();
        JsonNode undone = body(put("/api/tasks/" + id, token, taskPut("toggle", null, due, false)));
        assertThat(undone.get("completed").asBoolean()).isFalse();
        assertThat(undone.get("completedAt").isNull()).isTrue();
    }

    @Test
    void a26_patchCompletionSetsCompletedAtAndKeepsItWhenUnchanged() throws Exception {
        long id = createTask(token, "complete me");
        MvcResult result = patch("/api/tasks/" + id + "/completion", token, map("completed", true));
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).get("completed").asBoolean()).isTrue();
        String completedAt = body(result).get("completedAt").asText();
        assertThat(completedAt).isNotBlank();
        // true -> true leaves completedAt as it was
        JsonNode again = body(patch("/api/tasks/" + id + "/completion", token, map("completed", true)));
        assertThat(again.get("completedAt").asText()).isEqualTo(completedAt);
    }

    @Test
    void a27_overdueTaskCanStillBeCompleted() throws Exception {
        long id = createTask(token, "late");
        String yesterday = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS).toString();
        assertThat(status(put("/api/tasks/" + id, token, taskPut("late", null, yesterday, false)))).isEqualTo(200);
        assertThat(body(get("/api/tasks/" + id, token)).get("overdue").asBoolean()).isTrue();
        MvcResult result = patch("/api/tasks/" + id + "/completion", token, map("completed", true));
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).get("completed").asBoolean()).isTrue();
        assertThat(body(result).get("overdue").asBoolean()).isFalse();
    }

    @Test
    void a28_deleteThenGetIs404() throws Exception {
        long id = createTask(token, "bye");
        assertThat(status(delete("/api/tasks/" + id, token))).isEqualTo(204);
        assertThat(status(get("/api/tasks/" + id, token))).isEqualTo(404);
    }

    @Test
    void a29_newUserHasEmptyList() throws Exception {
        MvcResult result = get("/api/tasks", token);
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).isArray()).isTrue();
        assertThat(body(result)).isEmpty();
    }

    @Test
    void a30_titleMissingBlankOrTooLong() throws Exception {
        String due = isoIn(1, ChronoUnit.HOURS);
        List<Object> bad = new ArrayList<>();
        bad.add(map("description", "x", "dueAt", due));
        bad.add(taskBody("", null, due));
        bad.add(taskBody("    ", null, due));
        bad.add(taskBody("t".repeat(101), null, due));
        for (Object body : bad) {
            MvcResult result = post("/api/tasks", token, body);
            assertThat(status(result)).as(body.toString()).isEqualTo(400);
            assertThat(fieldMessages(result, "title")).as(body.toString()).isNotEmpty();
        }
    }

    @Test
    void a31_maximumLengthsAccepted() throws Exception {
        MvcResult result = post("/api/tasks", token,
                taskBody("t".repeat(100), "d".repeat(1000), isoIn(1, ChronoUnit.HOURS)));
        assertThat(status(result)).isEqualTo(201);
    }

    @Test
    void a32_descriptionTooLong() throws Exception {
        MvcResult result = post("/api/tasks", token,
                taskBody("ok", "d".repeat(1001), isoIn(1, ChronoUnit.HOURS)));
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "description")).contains("Description must be at most 1000 characters");
    }

    @Test
    void a33_dueAtMissing() throws Exception {
        MvcResult result = post("/api/tasks", token, map("title", "no due"));
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "dueAt")).contains("Due date and time is required");
    }

    @Test
    void a34_createWithDueAtOneHourAgoRejected() throws Exception {
        MvcResult result = post("/api/tasks", token, taskBody("past", null, isoIn(-1, ChronoUnit.HOURS)));
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "dueAt")).contains("Due date and time cannot be in the past");
    }

    @Test
    void a35_createWithinGraceWindowIsAcceptedAndOverdue() throws Exception {
        MvcResult result = post("/api/tasks", token, taskBody("grace", null, isoIn(-2, ChronoUnit.MINUTES)));
        assertThat(status(result)).isEqualTo(201);
        assertThat(body(result).get("overdue").asBoolean()).isTrue();
    }

    @Test
    void a36_unparsableDueAtRejected() throws Exception {
        for (String bad : new String[] {"2026-13-40T10:00:00Z", "2026-10-10", "2026-10-10T10:00", "not a date"}) {
            MvcResult result = post("/api/tasks", token, taskBody("bad due", null, bad));
            assertThat(status(result)).as(bad).isEqualTo(400);
        }
    }

    @Test
    void a37_putAcceptsPastDueAt() throws Exception {
        long id = createTask(token, "edit");
        String past = isoIn(-3, ChronoUnit.DAYS);
        MvcResult result = put("/api/tasks/" + id, token, taskPut("edit", null, past, false));
        assertThat(status(result)).isEqualTo(200);
        assertThat(Instant.parse(body(result).get("dueAt").asText())).isEqualTo(Instant.parse(past));
    }

    @Test
    void a38_putWithoutCompletedRejected() throws Exception {
        long id = createTask(token, "edit");
        MvcResult result = put("/api/tasks/" + id, token,
                map("title", "edit", "dueAt", isoIn(1, ChronoUnit.DAYS)));
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "completed")).contains("Completed is required");
    }

    @Test
    void a39_patchWithEmptyOrWrongTypeBody() throws Exception {
        long id = createTask(token, "x");
        assertThat(status(patch("/api/tasks/" + id + "/completion", token, "{}"))).isEqualTo(400);
        assertThat(status(patch("/api/tasks/" + id + "/completion", token, "{\"completed\":\"yes\"}")))
                .isEqualTo(400);
    }

    @Test
    void a40_invalidStatusParam() throws Exception {
        MvcResult result = get("/api/tasks?status=done", token);
        assertThat(status(result)).isEqualTo(400);
        assertThat(hasMessage(result, "Malformed request")).isTrue();
    }

    @Test
    void a41_nonNumericId() throws Exception {
        MvcResult result = get("/api/tasks/abc", token);
        assertThat(status(result)).isEqualTo(400);
        assertThat(hasMessage(result, "Malformed request")).isTrue();
    }

    @Test
    void a42_unknownIdIs404ForEveryMethod() throws Exception {
        String url = "/api/tasks/999999";
        List<MvcResult> results = List.of(
                get(url, token),
                put(url, token, taskPut("t", null, isoIn(1, ChronoUnit.DAYS), false)),
                patch(url + "/completion", token, map("completed", true)),
                delete(url, token));
        for (MvcResult result : results) {
            assertThat(status(result)).isEqualTo(404);
            assertThat(hasMessage(result, "Task not found")).isTrue();
        }
    }

    @Test
    void a43_deleteTwice() throws Exception {
        long id = createTask(token, "once");
        assertThat(status(delete("/api/tasks/" + id, token))).isEqualTo(204);
        assertThat(status(delete("/api/tasks/" + id, token))).isEqualTo(404);
    }

    @Test
    void a44_extraBodyFieldsAreIgnored() throws Exception {
        long bobId = registerUser(BOB, BOB_PASSWORD);
        Object body = map("id", 12345, "completed", true, "userId", bobId,
                "title", "extras", "description", null, "dueAt", isoIn(1, ChronoUnit.DAYS));
        MvcResult result = post("/api/tasks", token, body);
        assertThat(status(result)).isEqualTo(201);
        JsonNode task = body(result);
        assertThat(task.get("completed").asBoolean()).isFalse();
        assertThat(task.get("id").asLong()).isNotEqualTo(12345);
        long owner = jdbc.queryForObject("SELECT user_id FROM tasks WHERE id = ?", Long.class, task.get("id").asLong());
        assertThat(owner).isEqualTo(userId(ALICE));
    }

    @Test
    void a45_unicodeEmojiAndHtmlRoundTrip() throws Exception {
        String title = "Caf\u00e9 \u65e5\u672c\u8a9e \uD83D\uDE80 <script>alert(1)</script>";
        String description = "\u00fc\u00f1\u00ee & <b>bold</b> \"quoted\"";
        MvcResult created = post("/api/tasks", token, taskBody(title, description, isoIn(1, ChronoUnit.DAYS)));
        assertThat(status(created)).isEqualTo(201);
        long id = body(created).get("id").asLong();
        JsonNode task = body(get("/api/tasks/" + id, token));
        assertThat(task.get("title").asText()).isEqualTo(title);
        assertThat(task.get("description").asText()).isEqualTo(description);
    }

    @Test
    void a46_deleteOnCollectionIsMethodNotAllowed() throws Exception {
        MvcResult result = call(HttpMethod.DELETE, "/api/tasks", token, null);
        assertThat(status(result)).isEqualTo(405);
        assertThat(hasMessage(result, "Method not allowed")).isTrue();
    }
}
