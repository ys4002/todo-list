package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;

import java.nio.charset.StandardCharsets;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** S1-S8: isolation, authentication, tampering, CORS, error hygiene, authorities from the DB. */
class SecurityQaTest extends QaSupport {

    private String alice;
    private String bob;
    private long aliceTask;

    @BeforeEach
    void twoUsers() throws Exception {
        alice = registerAndLogin(ALICE, ALICE_PASSWORD);
        bob = registerAndLogin(BOB, BOB_PASSWORD);
        aliceTask = createTask(alice, "Alice only");
    }

    @Test
    void s01_bobCannotReadChangeCompleteOrDeleteAlicesTask() throws Exception {
        String url = "/api/tasks/" + aliceTask;
        List<MvcResult> attempts = List.of(
                get(url, bob),
                put(url, bob, taskPut("hacked", null, isoIn(1, ChronoUnit.DAYS), true)),
                patch(url + "/completion", bob, map("completed", true)),
                delete(url, bob));
        for (MvcResult attempt : attempts) {
            assertThat(status(attempt)).isEqualTo(404);
            assertThat(hasMessage(attempt, "Task not found")).isTrue();
        }
        JsonNode task = body(get(url, alice));
        assertThat(task.get("title").asText()).isEqualTo("Alice only");
        assertThat(task.get("completed").asBoolean()).isFalse();
    }

    @Test
    void s02_bobsListContainsNoneOfAlicesTasks() throws Exception {
        createTask(bob, "Bob only");
        JsonNode list = body(get("/api/tasks", bob));
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("title").asText()).isEqualTo("Bob only");
    }

    @Test
    void s03_everyProtectedEndpointRejectsMissingToken() throws Exception {
        String due = isoIn(1, ChronoUnit.DAYS);
        List<MvcResult> results = List.of(
                get("/api/auth/me", null),
                put("/api/auth/password", null, map("currentPassword", "x")),
                get("/api/tasks", null),
                get("/api/tasks/1", null),
                post("/api/tasks", null, taskBody("t", null, due)),
                put("/api/tasks/1", null, taskPut("t", null, due, false)),
                patch("/api/tasks/1/completion", null, map("completed", true)),
                delete("/api/tasks/1", null),
                get("/api/admin/users", null),
                get("/api/admin/users/1", null),
                patch("/api/admin/users/1/status", null, map("enabled", false)),
                put("/api/admin/users/1/password", null, map("newPassword", "x")),
                get("/api/admin/users/1/tasks", null),
                get("/api/admin/users/1/tasks/1", null),
                post("/api/admin/users/1/tasks", null, taskBody("t", null, due)),
                put("/api/admin/users/1/tasks/1", null, taskPut("t", null, due, false)),
                patch("/api/admin/users/1/tasks/1/completion", null, map("completed", true)),
                delete("/api/admin/users/1/tasks/1", null));
        for (MvcResult result : results) {
            String where = result.getRequest().getMethod() + " " + result.getRequest().getRequestURI();
            assertThat(status(result)).as(where).isEqualTo(401);
            JsonNode error = body(result);
            assertThat(error.get("status").asInt()).as(where).isEqualTo(401);
            assertThat(error.get("message").asText()).as(where).isEqualTo("Authentication required");
            assertThat(error.get("fieldErrors").isArray()).as(where).isTrue();
        }
    }

    @Test
    void s04_tamperedPayloadIsRejected() throws Exception {
        String[] parts = alice.split("\\.");
        for (String[] change : new String[][] {{"sub", String.valueOf(userId(BOB))}, {"role", "ADMIN"}}) {
            ObjectNode payload = (ObjectNode) payload(alice);
            if ("sub".equals(change[0])) {
                payload.put("sub", change[1]);
            } else {
                payload.put("role", change[1]);
            }
            String forgedPayload = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(json.writeValueAsBytes(payload));
            String forged = parts[0] + "." + forgedPayload + "." + parts[2];
            MvcResult result = get("/api/tasks", forged);
            assertThat(status(result)).as(change[0]).isEqualTo(401);
        }
        // alg=none must also be refused
        String header = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        assertThat(status(get("/api/tasks", header + "." + parts[1] + "."))).isEqualTo(401);
    }

    @Test
    void s05_corsPreflightAndExposedHeaders() throws Exception {
        MvcResult preflight = mvc.perform(options("/api/tasks")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")).andReturn();
        assertThat(status(preflight)).isEqualTo(200);
        assertThat(header(preflight, "Access-Control-Allow-Origin")).isEqualTo("http://localhost:3000");

        MvcResult actual = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/api/tasks").header("Origin", "http://localhost:3000")
                .header("Authorization", "Bearer " + alice)).andReturn();
        assertThat(status(actual)).isEqualTo(200);
        String exposed = String.valueOf(header(actual, "Access-Control-Expose-Headers")).toLowerCase();
        assertThat(exposed).contains("x-auth-token").contains("x-auth-expires-in").contains("location");

        // an unknown origin gets no CORS approval
        MvcResult foreign = mvc.perform(options("/api/tasks")
                .header("Origin", "http://evil.example")
                .header("Access-Control-Request-Method", "GET")).andReturn();
        assertThat(header(foreign, "Access-Control-Allow-Origin")).isNull();
    }

    @Test
    void s06_errorBodiesNeverLeakInternals() throws Exception {
        List<MvcResult> errors = List.of(
                get("/api/tasks/abc", alice),
                get("/api/does-not-exist", alice),
                call(HttpMethod.DELETE, "/api/tasks", alice, null),
                post("/api/auth/register", null, "{broken"),
                post("/api/tasks", alice, map("title", "x")),
                get("/api/tasks?status=zzz", alice),
                get("/api/tasks", "garbage"),
                get("/api/admin/users", alice));
        for (MvcResult result : errors) {
            String raw = result.getResponse().getContentAsString();
            assertThat(raw).as(result.getRequest().getRequestURI())
                    .doesNotContain("Exception").doesNotContain("\tat ").doesNotContain("com.todoapp")
                    .doesNotContain("org.springframework").doesNotContain("SQL").doesNotContain("hibernate");
        }
    }

    @Test
    void s06_unexpectedErrorsAreSanitised() throws Exception {
        // A task id beyond the BIGINT range is an unusual input; whatever status comes back, no internals leak.
        MvcResult result = get("/api/tasks/99999999999999999999999", alice);
        assertThat(status(result)).isLessThan(500);
        assertThat(result.getResponse().getContentAsString()).doesNotContain("Exception");
    }

    @Test
    void s07_userTokenGets403OnEveryAdminEndpoint() throws Exception {
        String due = isoIn(1, ChronoUnit.DAYS);
        long id = userId(BOB);
        List<MvcResult> results = List.of(
                get("/api/admin/users", alice),
                get("/api/admin/users/" + id, alice),
                patch("/api/admin/users/" + id + "/status", alice, map("enabled", false)),
                put("/api/admin/users/" + id + "/password", alice,
                        map("newPassword", "N3w#Secret", "confirmNewPassword", "N3w#Secret")),
                get("/api/admin/users/" + id + "/tasks", alice),
                get("/api/admin/users/" + id + "/tasks/1", alice),
                post("/api/admin/users/" + id + "/tasks", alice, taskBody("t", null, due)),
                put("/api/admin/users/" + id + "/tasks/1", alice, taskPut("t", null, due, false)),
                patch("/api/admin/users/" + id + "/tasks/1/completion", alice, map("completed", true)),
                delete("/api/admin/users/" + id + "/tasks/1", alice));
        for (MvcResult result : results) {
            String where = result.getRequest().getMethod() + " " + result.getRequest().getRequestURI();
            assertThat(status(result)).as(where).isEqualTo(403);
            assertThat(hasMessage(result, "Access denied")).as(where).isTrue();
        }
        // and nothing was changed
        assertThat(jdbc.queryForObject("SELECT enabled FROM users WHERE username = ?", Boolean.class, BOB)).isTrue();
    }

    @Test
    void s08_authoritiesComeFromTheDatabaseNotTheTokenClaim() throws Exception {
        assertThat(payload(bob).get("role").asText()).isEqualTo("USER");
        assertThat(status(get("/api/admin/users", bob))).isEqualTo(403);
        try {
            jdbc.update("UPDATE users SET role = 'ADMIN' WHERE username = ?", BOB);
            assertThat(status(get("/api/admin/users", bob))).isEqualTo(200);
        } finally {
            jdbc.update("UPDATE users SET role = 'USER' WHERE username = ?", BOB);
        }
        assertThat(status(get("/api/admin/users", bob))).isEqualTo(403);
        // and demotion takes effect too
        jdbc.update("UPDATE users SET role = 'USER' WHERE username = 'admin'");
        String admin = mintToken(ADMIN, java.time.Instant.now(), java.time.Instant.now().plusSeconds(600));
        assertThat(status(get("/api/admin/users", admin))).isEqualTo(403);
    }
}
