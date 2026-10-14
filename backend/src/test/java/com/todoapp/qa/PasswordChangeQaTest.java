package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

/** P1-P12: PUT /api/auth/password. */
class PasswordChangeQaTest extends QaSupport {

    private static final String NEW_PASSWORD = "N3w#Secret";
    private static final String URL = "/api/auth/password";

    private String t1;
    private String t2;

    @BeforeEach
    void setUpAlice() throws Exception {
        registerUser(ALICE, ALICE_PASSWORD);
        t1 = login(ALICE, ALICE_PASSWORD);
        t2 = login(ALICE, ALICE_PASSWORD);
    }

    private MvcResult change(String token, String current, String next, String confirm) throws Exception {
        return put(URL, token, map("currentPassword", current, "newPassword", next, "confirmNewPassword", confirm));
    }

    private MvcResult changeValid(String token) throws Exception {
        return change(token, ALICE_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    }

    @Test
    void p01_validChangeReturnsNewTokenInBodyAndHeader() throws Exception {
        MvcResult result = changeValid(t1);
        assertThat(status(result)).isEqualTo(200);
        JsonNode node = body(result);
        assertThat(node.get("token").asText()).isNotBlank();
        assertThat(node.get("expiresIn").asInt()).isEqualTo(3600);
        assertThat(node.at("/user/username").asText()).isEqualTo("alice_01");
        assertThat(header(result, "X-Auth-Token")).isEqualTo(node.get("token").asText());
        assertThat(result.getResponse().getContentAsString().toLowerCase()).doesNotContain("hash");
    }

    @Test
    void p02_oldPasswordStopsWorkingNewOneWorks() throws Exception {
        changeValid(t1);
        assertThat(status(loginRaw(ALICE, ALICE_PASSWORD))).isEqualTo(401);
        assertThat(status(loginRaw(ALICE, NEW_PASSWORD))).isEqualTo(200);
    }

    @Test
    void p03_allEarlierTokensAreRejected() throws Exception {
        assertThat(status(changeValid(t1))).isEqualTo(200);
        for (String old : new String[] {t1, t2}) {
            MvcResult result = get("/api/tasks", old);
            assertThat(status(result)).isEqualTo(401);
            assertThat(hasMessage(result, "Password has been changed. Please log in again.")).isTrue();
        }
    }

    @Test
    void p04_newTokenKeepsTheCallerLoggedIn() throws Exception {
        String fresh = body(changeValid(t1)).get("token").asText();
        assertThat(status(get("/api/tasks", fresh))).isEqualTo(200);
        assertThat(status(get("/api/auth/me", fresh))).isEqualTo(200);
    }

    @Test
    void p05_wrongCurrentPasswordIs400AndChangesNothing() throws Exception {
        MvcResult result = change(t1, "Wr0ng!Passw", NEW_PASSWORD, NEW_PASSWORD);
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "currentPassword")).contains("Current password is incorrect");
        assertThat(header(result, "X-Auth-Token")).isNotBlank();
        assertThat(status(loginRaw(ALICE, ALICE_PASSWORD))).isEqualTo(200);
        assertThat(status(get("/api/tasks", t1))).isEqualTo(200);
        assertThat(status(get("/api/tasks", t2))).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Sh0rt!", "n3w#secret", "N3W#SECRET", "New#Secret", "N3wSecret1", "N3w #Secret"})
    void p06_weakNewPasswords(String weak) throws Exception {
        MvcResult result = change(t1, ALICE_PASSWORD, weak, weak);
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "newPassword")).contains(STRENGTH_MESSAGE);
        assertThat(status(get("/api/tasks", t1))).isEqualTo(200);
    }

    @Test
    void p07_newPasswordContainingUsername() throws Exception {
        for (String bad : new String[] {"xalice_01!9A", "XALICE_01!9a"}) {
            MvcResult result = change(t1, ALICE_PASSWORD, bad, bad);
            assertThat(status(result)).as(bad).isEqualTo(400);
            assertThat(fieldMessages(result, "newPassword")).as(bad).contains(INVALID_PASSWORD_MESSAGE);
        }
    }

    @Test
    void p08_confirmMismatchOrMissing() throws Exception {
        MvcResult mismatch = change(t1, ALICE_PASSWORD, NEW_PASSWORD, "N3w#Other");
        assertThat(status(mismatch)).isEqualTo(400);
        assertThat(fieldMessages(mismatch, "confirmNewPassword")).contains("Passwords do not match");

        MvcResult missing = put(URL, t1, map("currentPassword", ALICE_PASSWORD, "newPassword", NEW_PASSWORD));
        assertThat(status(missing)).isEqualTo(400);
        assertThat(fieldMessages(missing, "confirmNewPassword")).contains("Confirm new password is required");
    }

    @Test
    void p09_newEqualsCurrent() throws Exception {
        MvcResult result = change(t1, ALICE_PASSWORD, ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "newPassword"))
                .contains("New password must be different from the current password");
    }

    @Test
    void p10_missingCurrentPasswordAndMalformedJson() throws Exception {
        MvcResult missing = put(URL, t1, map("newPassword", NEW_PASSWORD, "confirmNewPassword", NEW_PASSWORD));
        assertThat(status(missing)).isEqualTo(400);
        assertThat(fieldMessages(missing, "currentPassword")).contains("Current password is required");

        MvcResult malformed = put(URL, t1, "{oops");
        assertThat(status(malformed)).isEqualTo(400);
        assertThat(hasMessage(malformed, "Malformed request")).isTrue();
    }

    @Test
    void p11_noExpiredOrDisabledUserToken() throws Exception {
        Object body = map("currentPassword", ALICE_PASSWORD, "newPassword", NEW_PASSWORD,
                "confirmNewPassword", NEW_PASSWORD);
        MvcResult none = put(URL, null, body);
        assertThat(status(none)).isEqualTo(401);
        assertThat(hasMessage(none, "Authentication required")).isTrue();

        assertThat(status(put(URL, expiredToken(ALICE), body))).isEqualTo(401);

        jdbc.update("UPDATE users SET enabled = FALSE WHERE username = ?", ALICE);
        MvcResult disabled = put(URL, t1, body);
        assertThat(status(disabled)).isEqualTo(401);
        assertThat(hasMessage(disabled, "Account is disabled")).isTrue();
    }

    @Test
    void p12_adminCanChangeOwnPassword() throws Exception {
        String admin = adminToken();
        MvcResult result = put(URL, admin, map("currentPassword", ADMIN_DEFAULT_PASSWORD,
                "newPassword", "Adm1n#Secret", "confirmNewPassword", "Adm1n#Secret"));
        assertThat(status(result)).isEqualTo(200);
        String fresh = body(result).get("token").asText();
        assertThat(status(get("/api/admin/users", fresh))).isEqualTo(200);
        assertThat(status(loginRaw(ADMIN, ADMIN_DEFAULT_PASSWORD))).isEqualTo(401);
        assertThat(status(loginRaw(ADMIN, "Adm1n#Secret"))).isEqualTo(200);
    }
}
