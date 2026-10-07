package com.todoapp.qa;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.source.ImmutableSecret;

/**
 * Shared helpers for the QA-owned API integration tests. Everything goes through HTTP (MockMvc)
 * and the database (JdbcTemplate) only, so the tests depend on the contract, not on internals.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
abstract class QaSupport {

    static final String ALICE = "alice_01";
    static final String ALICE_PASSWORD = "Str0ng!Pass";
    static final String BOB = "bob_02";
    static final String BOB_PASSWORD = "An0ther#Pass";
    static final String ADMIN = "admin";
    static final String ADMIN_DEFAULT_PASSWORD = "admin";
    static final String INVALID_PASSWORD_MESSAGE =
            "Password must not contain the username";
    static final String STRENGTH_MESSAGE = "Password must be 8-64 characters with no spaces and include an "
            + "upper-case letter, a lower-case letter, a digit and a special character";

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected JwtEncoder jwtEncoder;
    @Value("${app.jwt.secret}") protected String jwtSecret;
    @Value("${app.jwt.issuer}") protected String jwtIssuer;

    @BeforeEach
    void cleanDatabase() {
        jdbc.update("DELETE FROM tasks");
        jdbc.update("DELETE FROM users WHERE username <> 'admin'");
        // other tests change the admin password; always start from the seeded state
        jdbc.update("UPDATE users SET password_hash = ?, token_version = 0, enabled = TRUE, role = 'ADMIN' "
                + "WHERE username = 'admin'", new BCryptPasswordEncoder().encode(ADMIN_DEFAULT_PASSWORD));
    }

    // ---------------------------------------------------------------- HTTP helpers

    protected Map<String, Object> map(Object... keyValues) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            result.put((String) keyValues[i], keyValues[i + 1]);
        }
        return result;
    }

    protected MvcResult call(HttpMethod method, String url, String token, Object body) throws Exception {
        MockHttpServletRequestBuilder builder = request(method, url);
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON)
                    .content(body instanceof String s ? s : json.writeValueAsString(body));
        }
        return mvc.perform(builder).andReturn();
    }

    protected MvcResult get(String url, String token) throws Exception {
        return call(HttpMethod.GET, url, token, null);
    }

    protected MvcResult post(String url, String token, Object body) throws Exception {
        return call(HttpMethod.POST, url, token, body);
    }

    protected MvcResult put(String url, String token, Object body) throws Exception {
        return call(HttpMethod.PUT, url, token, body);
    }

    protected MvcResult patch(String url, String token, Object body) throws Exception {
        return call(HttpMethod.PATCH, url, token, body);
    }

    protected MvcResult delete(String url, String token) throws Exception {
        return call(HttpMethod.DELETE, url, token, null);
    }

    protected int status(MvcResult result) {
        return result.getResponse().getStatus();
    }

    protected JsonNode body(MvcResult result) throws Exception {
        String content = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return content.isEmpty() ? null : json.readTree(content);
    }

    protected String header(MvcResult result, String name) {
        return result.getResponse().getHeader(name);
    }

    // ---------------------------------------------------------------- error assertions

    /** True when the body is an ApiError with the given message. */
    protected boolean hasMessage(MvcResult result, String message) throws Exception {
        JsonNode node = body(result);
        return node != null && message.equals(node.path("message").asText());
    }

    /** All messages reported for one field in fieldErrors. */
    protected java.util.List<String> fieldMessages(MvcResult result, String field) throws Exception {
        java.util.List<String> messages = new java.util.ArrayList<>();
        JsonNode errors = body(result).path("fieldErrors");
        for (JsonNode error : errors) {
            if (field.equals(error.path("field").asText())) {
                messages.add(error.path("message").asText());
            }
        }
        return messages;
    }

    // ---------------------------------------------------------------- users

    protected MvcResult register(String username, String name, String password, String confirm) throws Exception {
        return post("/api/auth/register", null, map("username", username, "name", name,
                "password", password, "confirmPassword", confirm));
    }

    protected long registerUser(String username, String password) throws Exception {
        MvcResult result = register(username, "Name " + username, password, password);
        if (status(result) != 201) {
            throw new AssertionError("register " + username + " expected 201 but was " + status(result)
                    + ": " + result.getResponse().getContentAsString());
        }
        return body(result).get("id").asLong();
    }

    protected MvcResult loginRaw(String username, String password) throws Exception {
        return post("/api/auth/login", null, map("username", username, "password", password));
    }

    protected String login(String username, String password) throws Exception {
        MvcResult result = loginRaw(username, password);
        if (status(result) != 200) {
            throw new AssertionError("login " + username + " expected 200 but was " + status(result)
                    + ": " + result.getResponse().getContentAsString());
        }
        return body(result).get("token").asText();
    }

    /** Registers and logs in; returns the token. */
    protected String registerAndLogin(String username, String password) throws Exception {
        registerUser(username, password);
        return login(username, password);
    }

    protected String adminToken() throws Exception {
        return login(ADMIN, ADMIN_DEFAULT_PASSWORD);
    }

    protected long userId(String username) {
        return jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Long.class, username);
    }

    // ---------------------------------------------------------------- tasks

    protected String isoIn(long amount, ChronoUnit unit) {
        return Instant.now().plus(amount, unit).truncatedTo(ChronoUnit.SECONDS).toString();
    }

    protected Map<String, Object> taskBody(String title, String description, String dueAt) {
        return map("title", title, "description", description, "dueAt", dueAt);
    }

    protected Map<String, Object> taskPut(String title, String description, String dueAt, boolean completed) {
        return map("title", title, "description", description, "dueAt", dueAt, "completed", completed);
    }

    /** Creates a task through the given base path (/api/tasks or the admin one); returns its id. */
    protected long createTask(String token, String basePath, String title, String description, String dueAt)
            throws Exception {
        MvcResult result = post(basePath, token, taskBody(title, description, dueAt));
        if (status(result) != 201) {
            throw new AssertionError("create task expected 201 but was " + status(result) + ": "
                    + result.getResponse().getContentAsString());
        }
        return body(result).get("id").asLong();
    }

    protected long createTask(String token, String title) throws Exception {
        return createTask(token, "/api/tasks", title, null, isoIn(1, ChronoUnit.DAYS));
    }

    /** Sets a task's due_at straight in the DB, bypassing the create-in-the-past rule. */
    protected void setDueAt(long taskId, Instant dueAt) {
        jdbc.update("UPDATE tasks SET due_at = ? WHERE id = ?",
                java.sql.Timestamp.from(dueAt), taskId);
    }

    // ---------------------------------------------------------------- tokens

    /** Builds a signed token with explicit claims. ver defaults to the user's current token_version. */
    protected String mintToken(long userId, String username, String role, int ver, Instant issuedAt,
            Instant expiresAt, JwtEncoder encoder) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(jwtIssuer)
                .subject(String.valueOf(userId))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("username", username)
                .claim("role", role)
                .claim("ver", ver)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    protected String mintToken(String username, Instant issuedAt, Instant expiresAt) {
        long id = userId(username);
        String role = jdbc.queryForObject("SELECT role FROM users WHERE username = ?", String.class, username);
        int ver = jdbc.queryForObject("SELECT token_version FROM users WHERE username = ?", Integer.class, username);
        return mintToken(id, username, role, ver, issuedAt, expiresAt, jwtEncoder);
    }

    protected String expiredToken(String username) {
        Instant now = Instant.now();
        return mintToken(username, now.minus(2, ChronoUnit.HOURS), now.minus(1, ChronoUnit.HOURS));
    }

    protected String wrongSecretToken(String username) {
        byte[] bytes = "a-completely-different-secret-0123456789".getBytes(StandardCharsets.UTF_8);
        JwtEncoder other = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(bytes, "HmacSHA256")));
        Instant now = Instant.now();
        return mintToken(userId(username), username, "USER", 0, now, now.plus(1, ChronoUnit.HOURS), other);
    }

    /** Decodes the payload part of a JWT without verifying it. */
    protected JsonNode payload(String token) throws Exception {
        String part = token.split("\\.")[1];
        return json.readTree(Base64.getUrlDecoder().decode(part));
    }
}
