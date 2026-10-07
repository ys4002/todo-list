package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

/** A1-A16: registration, login and /auth/me. */
class AuthApiQaTest extends QaSupport {

    @Test
    void a01_validRegisterReturnsLowerCasedUserWithoutSecrets() throws Exception {
        MvcResult result = register("Alice_01", "Alice Smith", ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(201);
        JsonNode user = body(result);
        assertThat(user.get("username").asText()).isEqualTo("alice_01");
        assertThat(user.get("name").asText()).isEqualTo("Alice Smith");
        assertThat(user.get("role").asText()).isEqualTo("USER");
        assertThat(user.has("id")).isTrue();
        assertThat(user.has("createdAt")).isTrue();
        String raw = result.getResponse().getContentAsString().toLowerCase();
        assertThat(raw).doesNotContain("password").doesNotContain("hash").doesNotContain("$2");
    }

    @Test
    void a02_duplicateUsernameIsCaseInsensitiveConflict() throws Exception {
        registerUser(ALICE, ALICE_PASSWORD);
        MvcResult result = register("ALICE_01", "Other", ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(409);
        assertThat(body(result).get("message").asText()).isEqualTo("Username is already taken");
    }

    @Test
    void a03_registeringAdminInAnyCaseIsConflict() throws Exception {
        MvcResult result = register("Admin", "Fake Admin", ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(409);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ab", "a2345678901234567890123456789012", "1abc", "bad name", "al!ce"})
    void a04_invalidUsernamesRejected(String username) throws Exception {
        MvcResult result = register(username, "Name", "Str0ng!Pass", "Str0ng!Pass");
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "username")).isNotEmpty();
    }

    @Test
    void a04_usernameLengthBoundaries() throws Exception {
        assertThat("a2345678901234567890123456789012").hasSize(32); // guards the 31/32-char fixture below
        String thirty = "a" + "b".repeat(29);
        String thirtyOne = "a" + "b".repeat(30);
        assertThat(status(register(thirty, "Name", ALICE_PASSWORD, ALICE_PASSWORD))).isEqualTo(201);
        MvcResult result = register(thirtyOne, "Name", ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "username")).isNotEmpty();
        assertThat(status(register("abc", "Name", ALICE_PASSWORD, ALICE_PASSWORD))).isEqualTo(201);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Sh0rt!", "str0ng!pass", "STR0NG!PASS", "Strong!Pass", "Str0ngPass1", "Str0ng !Pass"})
    void a05_weakPasswordsRejected(String password) throws Exception {
        MvcResult result = register(ALICE, "Alice", password, password);
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "password")).contains(STRENGTH_MESSAGE);
    }

    @Test
    void a05_sixtyFiveCharPasswordRejectedAndSixtyFourAccepted() throws Exception {
        String tooLong = "Aa1!" + "x".repeat(61);
        assertThat(tooLong).hasSize(65);
        MvcResult result = register(ALICE, "Alice", tooLong, tooLong);
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "password")).contains(STRENGTH_MESSAGE);
        String ok = "Aa1!" + "x".repeat(60);
        assertThat(status(register(ALICE, "Alice", ok, ok))).isEqualTo(201);
    }

    @Test
    void a06_passwordContainingUsernameRejected() throws Exception {
        MvcResult result = register(ALICE, "Alice", "Xalice_01!9", "Xalice_01!9");
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "password")).contains(INVALID_PASSWORD_MESSAGE);
        // case-insensitive
        MvcResult upper = register(ALICE, "Alice", "xALICE_01!9", "xALICE_01!9");
        assertThat(status(upper)).isEqualTo(400);
        assertThat(fieldMessages(upper, "password")).contains(INVALID_PASSWORD_MESSAGE);
    }

    @Test
    void a07_confirmPasswordMismatchOrMissing() throws Exception {
        MvcResult mismatch = register(ALICE, "Alice", ALICE_PASSWORD, "Different1!");
        assertThat(status(mismatch)).isEqualTo(400);
        assertThat(fieldMessages(mismatch, "confirmPassword")).contains("Passwords do not match");

        MvcResult missing = post("/api/auth/register", null,
                map("username", ALICE, "name", "Alice", "password", ALICE_PASSWORD));
        assertThat(status(missing)).isEqualTo(400);
        assertThat(fieldMessages(missing, "confirmPassword")).contains("Confirm password is required");
    }

    @Test
    void a08_nameMissingOrTooLong() throws Exception {
        MvcResult missing = post("/api/auth/register", null,
                map("username", ALICE, "password", ALICE_PASSWORD, "confirmPassword", ALICE_PASSWORD));
        assertThat(status(missing)).isEqualTo(400);
        assertThat(fieldMessages(missing, "name")).isNotEmpty();

        MvcResult tooLong = register(ALICE, "n".repeat(101), ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(tooLong)).isEqualTo(400);
        assertThat(fieldMessages(tooLong, "name")).contains("Name must be at most 100 characters");
    }

    @Test
    void a09_malformedJson() throws Exception {
        MvcResult result = post("/api/auth/register", null, "{not json");
        assertThat(status(result)).isEqualTo(400);
        assertThat(hasMessage(result, "Malformed request")).isTrue();
        assertThat(body(result).get("fieldErrors").isArray()).isTrue();
    }

    @Test
    void a10_passwordStoredAsBcrypt() throws Exception {
        registerUser(ALICE, ALICE_PASSWORD);
        String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE username = ?",
                String.class, ALICE);
        assertThat(hash).matches("^\\$2[aby]\\$.*").isNotEqualTo(ALICE_PASSWORD);
    }

    @Test
    void a11_loginIsCaseInsensitiveOnUsername() throws Exception {
        registerUser(ALICE, ALICE_PASSWORD);
        MvcResult result = loginRaw("ALICE_01", ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(200);
        JsonNode node = body(result);
        assertThat(node.get("token").asText()).isNotBlank();
        assertThat(node.get("tokenType").asText()).isEqualTo("Bearer");
        assertThat(node.get("expiresIn").asInt()).isEqualTo(3600);
        assertThat(node.at("/user/role").asText()).isEqualTo("USER");
        assertThat(node.at("/user/username").asText()).isEqualTo("alice_01");
    }

    @Test
    void a11_registeredUsernameWithWhitespaceIsTrimmed() throws Exception {
        MvcResult result = register(" Alice_01 ", "Alice", ALICE_PASSWORD, ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(201);
        assertThat(body(result).get("username").asText()).isEqualTo("alice_01");
    }

    @Test
    void a12_wrongPassword() throws Exception {
        registerUser(ALICE, ALICE_PASSWORD);
        MvcResult result = loginRaw(ALICE, "Wr0ng!Password");
        assertThat(status(result)).isEqualTo(401);
        assertThat(hasMessage(result, "Invalid username or password")).isTrue();
    }

    @Test
    void a13_unknownUsernameGivesSameMessage() throws Exception {
        MvcResult result = loginRaw("nobody_here", ALICE_PASSWORD);
        assertThat(status(result)).isEqualTo(401);
        assertThat(hasMessage(result, "Invalid username or password")).isTrue();
    }

    @Test
    void a14_emptyLoginFields() throws Exception {
        MvcResult result = post("/api/auth/login", null, map("username", "", "password", ""));
        assertThat(status(result)).isEqualTo(400);
        assertThat(fieldMessages(result, "username")).contains("Username is required");
        assertThat(fieldMessages(result, "password")).contains("Password is required");
    }

    @Test
    void a15_seededAdminCanLogIn() throws Exception {
        MvcResult result = loginRaw(ADMIN, ADMIN_DEFAULT_PASSWORD);
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).at("/user/role").asText()).isEqualTo("ADMIN");
    }

    @Test
    void a16_meWithValidToken() throws Exception {
        String token = registerAndLogin(ALICE, ALICE_PASSWORD);
        MvcResult result = get("/api/auth/me", token);
        assertThat(status(result)).isEqualTo(200);
        assertThat(body(result).get("username").asText()).isEqualTo("alice_01");
        assertThat(body(result).get("role").asText()).isEqualTo("USER");
    }

    @Test
    void a16_meWithMissingGarbageExpiredOrWrongSecretToken() throws Exception {
        registerUser(ALICE, ALICE_PASSWORD);
        String[] tokens = {null, "garbage.token.value", expiredToken(ALICE), wrongSecretToken(ALICE)};
        for (String token : tokens) {
            MvcResult result = get("/api/auth/me", token);
            assertThat(status(result)).as("token=%s", token).isEqualTo(401);
            assertThat(hasMessage(result, "Authentication required")).as("token=%s", token).isTrue();
        }
    }
}
