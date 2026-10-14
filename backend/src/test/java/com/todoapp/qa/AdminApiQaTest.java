package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

/** AD1-AD24: admin user management, admin task management, admin password reset. */
class AdminApiQaTest extends QaSupport {

    private static final String NEW_PASSWORD = "N3w#Secret";

    @Autowired private List<ApplicationRunner> runners;

    private String admin;
    private String alice;
    private String bob;
    private long aliceId;
    private long bobId;

    @BeforeEach
    void setUp() throws Exception {
        aliceId = registerUser(ALICE, ALICE_PASSWORD);
        bobId = registerUser(BOB, BOB_PASSWORD);
        admin = adminToken();
        alice = login(ALICE, ALICE_PASSWORD);
        bob = login(BOB, BOB_PASSWORD);
    }

    private String usersUrl(long id) {
        return "/api/admin/users/" + id;
    }

    private List<String> usernames(MvcResult result) throws Exception {
        List<String> names = new ArrayList<>();
        for (JsonNode node : body(result)) {
            names.add(node.get("username").asText());
        }
        return names;
    }

    private List<String> titles(MvcResult result) throws Exception {
        List<String> names = new ArrayList<>();
        for (JsonNode node : body(result)) {
            names.add(node.get("title").asText());
        }
        return names;
    }

    private MvcResult reset(String token, long id, String next, String confirm) throws Exception {
        return put(usersUrl(id) + "/password", token, map("newPassword", next, "confirmNewPassword", confirm));
    }

    private void rerunSeeder() throws Exception {
        ApplicationArguments args = new DefaultApplicationArguments();
        for (ApplicationRunner runner : runners) {
            runner.run(args);
        }
    }

    // ---------------------------------------------------------------- seed

    @Test
    void ad01_exactlyOneBcryptAdminSurvivesSeederReruns() throws Exception {
        rerunSeeder();
        rerunSeeder();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE LOWER(username) = 'admin'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT role FROM users WHERE username = 'admin'", String.class))
                .isEqualTo("ADMIN");
        assertThat(jdbc.queryForObject("SELECT enabled FROM users WHERE username = 'admin'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT password_hash FROM users WHERE username = 'admin'", String.class))
                .matches("^\\$2[aby]\\$.*");
    }

    // ---------------------------------------------------------------- users

    @Test
    void ad02_listsAllUsersSortedWithCountsAndNoHash() throws Exception {
        createTask(alice, "open one");
        createTask(alice, "open two");
        long done = createTask(alice, "done one");
        patch("/api/tasks/" + done + "/completion", alice, map("completed", true));
        MvcResult result = get("/api/admin/users", admin);
        assertThat(status(result)).isEqualTo(200);
        assertThat(usernames(result)).containsExactly("admin", "alice_01", "bob_02");
        JsonNode aliceRow = body(result).get(1);
        assertThat(aliceRow.get("taskCount").asInt()).isEqualTo(3);
        assertThat(aliceRow.get("openTaskCount").asInt()).isEqualTo(2);
        assertThat(aliceRow.get("enabled").asBoolean()).isTrue();
        assertThat(aliceRow.get("role").asText()).isEqualTo("USER");
        assertThat(body(result).get(2).get("taskCount").asInt()).isZero();
        String raw = result.getResponse().getContentAsString().toLowerCase();
        assertThat(raw).doesNotContain("password").doesNotContain("hash");
    }

    @Test
    void ad03_searchByUsernameOrNameCaseInsensitive() throws Exception {
        assertThat(usernames(get("/api/admin/users?q=ALI", admin))).containsExactly("alice_01");
        assertThat(usernames(get("/api/admin/users?q=Name%20alice", admin))).containsExactly("alice_01");
        assertThat(usernames(get("/api/admin/users?q=zzz", admin))).isEmpty();
        assertThat(status(get("/api/admin/users?q=" + "a".repeat(101), admin))).isEqualTo(400);
    }

    @Test
    void ad04_getOneUserAndUnknownId() throws Exception {
        MvcResult found = get(usersUrl(aliceId), admin);
        assertThat(status(found)).isEqualTo(200);
        assertThat(body(found).get("username").asText()).isEqualTo("alice_01");
        MvcResult missing = get(usersUrl(999999), admin);
        assertThat(status(missing)).isEqualTo(404);
        assertThat(hasMessage(missing, "User not found")).isTrue();
        assertThat(status(get("/api/admin/users/abc", admin))).isEqualTo(400);
    }

    // ---------------------------------------------------------------- enable / disable

    @Test
    void ad05_to08_disableBlocksLoginAndTokensEnableRestores() throws Exception {
        MvcResult disabled = patch(usersUrl(bobId) + "/status", admin, map("enabled", false));
        assertThat(status(disabled)).isEqualTo(200);
        assertThat(body(disabled).get("enabled").asBoolean()).isFalse();

        // AD6
        MvcResult correct = loginRaw(BOB, BOB_PASSWORD);
        assertThat(status(correct)).isEqualTo(403);
        assertThat(hasMessage(correct, "Account is disabled")).isTrue();
        MvcResult wrong = loginRaw(BOB, "Wr0ng!Passw");
        assertThat(status(wrong)).isEqualTo(401);
        assertThat(hasMessage(wrong, "Invalid username or password")).isTrue();

        // AD7
        MvcResult oldToken = get("/api/tasks", bob);
        assertThat(status(oldToken)).isEqualTo(401);
        assertThat(hasMessage(oldToken, "Account is disabled")).isTrue();

        // AD8
        MvcResult enabled = patch(usersUrl(bobId) + "/status", admin, map("enabled", true));
        assertThat(status(enabled)).isEqualTo(200);
        assertThat(body(enabled).get("enabled").asBoolean()).isTrue();
        assertThat(status(loginRaw(BOB, BOB_PASSWORD))).isEqualTo(200);
        // idempotent
        assertThat(status(patch(usersUrl(bobId) + "/status", admin, map("enabled", true)))).isEqualTo(200);
    }

    @Test
    void ad09_adminCannotDisableSelf() throws Exception {
        MvcResult result = patch(usersUrl(userId(ADMIN)) + "/status", admin, map("enabled", false));
        assertThat(status(result)).isEqualTo(409);
        assertThat(hasMessage(result, "You cannot disable your own account")).isTrue();
        assertThat(jdbc.queryForObject("SELECT enabled FROM users WHERE username = 'admin'", Boolean.class)).isTrue();
        assertThat(status(get("/api/admin/users", admin))).isEqualTo(200);
    }

    @Test
    void ad10_badStatusBodies() throws Exception {
        assertThat(status(patch(usersUrl(bobId) + "/status", admin, "{}"))).isEqualTo(400);
        assertThat(status(patch(usersUrl(bobId) + "/status", admin, "{\"enabled\":\"no\"}"))).isEqualTo(400);
        assertThat(status(patch(usersUrl(999999) + "/status", admin, map("enabled", false)))).isEqualTo(404);
    }

    // ---------------------------------------------------------------- admin task management

    @Test
    void ad11_adminSearchMatchesTheUsersOwnSearch() throws Exception {
        createTask(alice, "/api/tasks", "Buy milk", null, isoIn(1, ChronoUnit.DAYS));
        long second = createTask(alice, "/api/tasks", "Milk run", "later", isoIn(2, ChronoUnit.DAYS));
        createTask(alice, "/api/tasks", "Other", null, isoIn(3, ChronoUnit.DAYS));
        patch("/api/tasks/" + second + "/completion", alice, map("completed", true));
        String query = "?status=active&q=milk";
        assertThat(titles(get(usersUrl(aliceId) + "/tasks" + query, admin)))
                .isEqualTo(titles(get("/api/tasks" + query, alice))).containsExactly("Buy milk");
        assertThat(titles(get(usersUrl(aliceId) + "/tasks", admin))).containsExactly("Buy milk", "Milk run", "Other");
    }

    @Test
    void ad12_adminCreatesTaskForAlice() throws Exception {
        MvcResult result = post(usersUrl(aliceId) + "/tasks", admin,
                taskBody("From admin", "desc", isoIn(1, ChronoUnit.DAYS)));
        assertThat(status(result)).isEqualTo(201);
        long id = body(result).get("id").asLong();
        assertThat(header(result, "Location")).isEqualTo(usersUrl(aliceId) + "/tasks/" + id);
        assertThat(titles(get("/api/tasks", alice))).contains("From admin");
        assertThat(jdbc.queryForObject("SELECT user_id FROM tasks WHERE id = ?", Long.class, id)).isEqualTo(aliceId);
    }

    @Test
    void ad13_adminUpdatesCompletesUncompletesAndDeletes() throws Exception {
        long id = createTask(alice, "orig");
        String base = usersUrl(aliceId) + "/tasks/" + id;

        MvcResult updated = put(base, admin, taskPut("changed", "d", isoIn(2, ChronoUnit.DAYS), false));
        assertThat(status(updated)).isEqualTo(200);
        assertThat(body(get("/api/tasks/" + id, alice)).get("title").asText()).isEqualTo("changed");

        MvcResult completed = patch(base + "/completion", admin, map("completed", true));
        assertThat(status(completed)).isEqualTo(200);
        assertThat(body(get("/api/tasks/" + id, alice)).get("completed").asBoolean()).isTrue();

        MvcResult uncompleted = patch(base + "/completion", admin, map("completed", false));
        assertThat(status(uncompleted)).isEqualTo(200);
        JsonNode after = body(get("/api/tasks/" + id, alice));
        assertThat(after.get("completed").asBoolean()).isFalse();
        assertThat(after.get("completedAt").isNull()).isTrue();

        assertThat(status(get(base, admin))).isEqualTo(200);
        assertThat(status(delete(base, admin))).isEqualTo(204);
        assertThat(status(get("/api/tasks/" + id, alice))).isEqualTo(404);
    }

    @Test
    void ad14_taskUnderTheWrongUserIs404() throws Exception {
        long aliceTask = createTask(alice, "alice's");
        String wrong = usersUrl(bobId) + "/tasks/" + aliceTask;
        List<MvcResult> results = List.of(
                get(wrong, admin),
                put(wrong, admin, taskPut("x", null, isoIn(1, ChronoUnit.DAYS), false)),
                patch(wrong + "/completion", admin, map("completed", true)),
                delete(wrong, admin));
        for (MvcResult result : results) {
            assertThat(status(result)).isEqualTo(404);
            assertThat(hasMessage(result, "Task not found")).isTrue();
        }
        assertThat(body(get("/api/tasks/" + aliceTask, alice)).get("title").asText()).isEqualTo("alice's");
    }

    @Test
    void ad15_unknownUserOnTaskEndpoints() throws Exception {
        String base = usersUrl(999999) + "/tasks";
        String due = isoIn(1, ChronoUnit.DAYS);
        List<MvcResult> results = List.of(
                get(base, admin),
                get(base + "/1", admin),
                post(base, admin, taskBody("t", null, due)),
                put(base + "/1", admin, taskPut("t", null, due, false)),
                patch(base + "/1/completion", admin, map("completed", true)),
                delete(base + "/1", admin));
        for (MvcResult result : results) {
            assertThat(status(result)).as(result.getRequest().getMethod()).isEqualTo(404);
            assertThat(hasMessage(result, "User not found")).isTrue();
        }
    }

    @Test
    void ad16_adminOwnTasksAndValidationMatchUsers() throws Exception {
        long own = createTask(admin, "admin's own");
        assertThat(titles(get("/api/tasks", admin))).containsExactly("admin's own");
        assertThat(status(get("/api/tasks/" + own, admin))).isEqualTo(200);
        // not visible to Alice
        assertThat(status(get("/api/tasks/" + own, alice))).isEqualTo(404);

        MvcResult invalid = post(usersUrl(aliceId) + "/tasks", admin, map("title", "", "dueAt", isoIn(1, ChronoUnit.DAYS)));
        assertThat(status(invalid)).isEqualTo(400);
        assertThat(fieldMessages(invalid, "title")).isNotEmpty();
        MvcResult past = post(usersUrl(aliceId) + "/tasks", admin, taskBody("p", null, isoIn(-2, ChronoUnit.HOURS)));
        assertThat(status(past)).isEqualTo(400);
        assertThat(fieldMessages(past, "dueAt")).contains("Due date and time cannot be in the past");
    }

    @Test
    void ad16_adminCanManageTasksOfDisabledUsers() throws Exception {
        long id = createTask(bob, "bob's");
        patch(usersUrl(bobId) + "/status", admin, map("enabled", false));
        assertThat(status(get(usersUrl(bobId) + "/tasks/" + id, admin))).isEqualTo(200);
        assertThat(status(patch(usersUrl(bobId) + "/tasks/" + id + "/completion", admin, map("completed", true))))
                .isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tasks WHERE user_id = ?", Integer.class, bobId))
                .isEqualTo(1);
    }

    // ---------------------------------------------------------------- password reset

    @Test
    void ad17_resetWithoutOldPassword() throws Exception {
        MvcResult result = reset(admin, aliceId, NEW_PASSWORD, NEW_PASSWORD);
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).get("username").asText()).isEqualTo("alice_01");
        assertThat(result.getResponse().getContentAsString().toLowerCase()).doesNotContain("hash");
        assertThat(status(loginRaw(ALICE, NEW_PASSWORD))).isEqualTo(200);
        assertThat(status(loginRaw(ALICE, ALICE_PASSWORD))).isEqualTo(401);
    }

    @Test
    void ad18_aliceOldTokenIsInvalidatedByTheReset() throws Exception {
        assertThat(status(reset(admin, aliceId, NEW_PASSWORD, NEW_PASSWORD))).isEqualTo(200);
        MvcResult old = get("/api/tasks", alice);
        assertThat(status(old)).isEqualTo(401);
        assertThat(hasMessage(old, "Password has been changed. Please log in again.")).isTrue();
        // the admin (who did not change their own password) keeps working
        assertThat(status(get("/api/admin/users", admin))).isEqualTo(200);
    }

    @Test
    void ad19_invalidResetPasswords() throws Exception {
        MvcResult weak = reset(admin, aliceId, "weak", "weak");
        assertThat(status(weak)).isEqualTo(400);
        assertThat(fieldMessages(weak, "newPassword")).contains(STRENGTH_MESSAGE);

        MvcResult username = reset(admin, aliceId, "Xalice_01!9", "Xalice_01!9");
        assertThat(status(username)).isEqualTo(400);
        assertThat(fieldMessages(username, "newPassword")).contains(INVALID_PASSWORD_MESSAGE);

        MvcResult mismatch = reset(admin, aliceId, NEW_PASSWORD, "N3w#Other");
        assertThat(status(mismatch)).isEqualTo(400);
        assertThat(fieldMessages(mismatch, "confirmNewPassword")).contains("Passwords do not match");

        assertThat(status(loginRaw(ALICE, ALICE_PASSWORD))).isEqualTo(200); // unchanged
    }

    @Test
    void ad19_resetChecksTheTargetsUsernameNotTheAdminsName() throws Exception {
        // contains "admin" but not "alice_01": allowed for Alice's reset
        assertThat(status(reset(admin, aliceId, "Admin#Pass1x", "Admin#Pass1x"))).isEqualTo(200);
    }

    @Test
    void ad20_resetToTheCurrentPasswordIsAllowed() throws Exception {
        assertThat(status(reset(admin, aliceId, ALICE_PASSWORD, ALICE_PASSWORD))).isEqualTo(200);
        assertThat(status(loginRaw(ALICE, ALICE_PASSWORD))).isEqualTo(200);
    }

    @Test
    void ad21_resetUnknownUser() throws Exception {
        MvcResult result = reset(admin, 999999, NEW_PASSWORD, NEW_PASSWORD);
        assertThat(status(result)).isEqualTo(404);
        assertThat(hasMessage(result, "User not found")).isTrue();
    }

    @Test
    void ad22_nonAdminOrAnonymousCannotReset() throws Exception {
        MvcResult other = reset(bob, aliceId, NEW_PASSWORD, NEW_PASSWORD);
        assertThat(status(other)).isEqualTo(403);
        assertThat(hasMessage(other, "Access denied")).isTrue();
        MvcResult self = reset(alice, aliceId, NEW_PASSWORD, NEW_PASSWORD);
        assertThat(status(self)).isEqualTo(403);
        assertThat(hasMessage(self, "Access denied")).isTrue();
        assertThat(status(reset(null, aliceId, NEW_PASSWORD, NEW_PASSWORD))).isEqualTo(401);
        assertThat(status(loginRaw(ALICE, ALICE_PASSWORD))).isEqualTo(200);
    }

    @Test
    void ad23_resettingADisabledUsersPasswordKeepsThemDisabled() throws Exception {
        patch(usersUrl(bobId) + "/status", admin, map("enabled", false));
        MvcResult result = reset(admin, bobId, NEW_PASSWORD, NEW_PASSWORD);
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).get("enabled").asBoolean()).isFalse();
        MvcResult login = loginRaw(BOB, NEW_PASSWORD);
        assertThat(status(login)).isEqualTo(403);
        assertThat(hasMessage(login, "Account is disabled")).isTrue();
        // password verified first: the old password is simply wrong
        assertThat(status(loginRaw(BOB, BOB_PASSWORD))).isEqualTo(401);
        patch(usersUrl(bobId) + "/status", admin, map("enabled", true));
        assertThat(status(loginRaw(BOB, NEW_PASSWORD))).isEqualTo(200);
    }

    @Test
    void ad24_adminResetsOwnPasswordAndItSurvivesSeederRerun() throws Exception {
        long adminId = userId(ADMIN);
        MvcResult result = reset(admin, adminId, "Adm1n#Secret", "Adm1n#Secret");
        assertThat(status(result)).isEqualTo(200);
        String fresh = header(result, "X-Auth-Token");
        assertThat(fresh).isNotBlank();
        assertThat(status(get("/api/admin/users", fresh))).isEqualTo(200);
        assertThat(status(get("/api/admin/users", admin))).isEqualTo(401);

        rerunSeeder(); // stands in for a restart: the seeder runs again
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE username = 'admin'", Integer.class))
                .isEqualTo(1);
        assertThat(status(loginRaw(ADMIN, ADMIN_DEFAULT_PASSWORD))).isEqualTo(401);
        assertThat(status(loginRaw(ADMIN, "Adm1n#Secret"))).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "DELETE"})
    void unsupportedMethodsOnPasswordResetAre405(String method) throws Exception {
        MvcResult result = call(HttpMethod.valueOf(method), usersUrl(aliceId) + "/password", admin, null);
        assertThat(status(result)).isEqualTo(405);
    }
}
