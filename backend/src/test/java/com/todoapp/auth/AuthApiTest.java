package com.todoapp.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.todoapp.task.TaskRepository;
import com.todoapp.user.AdminSeeder;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthApiTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TaskRepository taskRepository;
    @Autowired
    private AdminSeeder adminSeeder;

    @BeforeEach
    void clean() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        adminSeeder.seed();
    }

    @AfterEach
    void cleanAfter() {
        clean();
    }

    private ResultActions json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, String body)
            throws Exception {
        return mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String registerBody(String username, String password, String confirm) {
        return """
                {"username":"%s","name":"Alice Smith","password":"%s","confirmPassword":"%s"}""".formatted(username, password, confirm);
    }

    private void register(String username, String password) throws Exception {
        json(post("/api/auth/register"), registerBody(username, password, password)).andExpect(status().isCreated());
    }

    private JsonNode login(String username, String password) throws Exception {
        String body = json(post("/api/auth/login"), """
                {"username":"%s","password":"%s"}""".formatted(username, password))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    @Test
    void registerReturns201WithoutSecrets() throws Exception {
        json(post("/api/auth/register"), registerBody("Alice_01", "Str0ng!Pass", "Str0ng!Pass"))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("X-Auth-Token"))
                .andExpect(jsonPath("$.username").value("alice_01"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.createdAt").exists())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        User stored = userRepository.findByUsername("alice_01").orElseThrow();
        assertThat(stored.getPasswordHash()).startsWith("$2");
    }

    @Test
    void duplicateAndAdminUsernameAre409() throws Exception {
        register("alice_01", "Str0ng!Pass");
        json(post("/api/auth/register"), registerBody("ALICE_01", "Str0ng!Pass", "Str0ng!Pass"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Username is already taken"));
        json(post("/api/auth/register"), registerBody("Admin", "Str0ng!Pass", "Str0ng!Pass"))
                .andExpect(status().isConflict());
    }

    @Test
    void registerValidationErrors() throws Exception {
        json(post("/api/auth/register"), registerBody("1abc", "Str0ng!Pass", "Other!Pass1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='username')]").exists())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='confirmPassword')].message").value("Passwords do not match"));
        json(post("/api/auth/register"), registerBody("alice_01", "weak", "weak"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='password')]").exists());
        json(post("/api/auth/register"), registerBody("alice_01", "Alice_01!x", "Alice_01!x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("password"))
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Password must not contain the username"));
        json(post("/api/auth/register"), """
                {"username":"alice_01","name":"Al","password":"Str0ng!Pass"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Confirm password is required"));
        json(post("/api/auth/register"), "{not json")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));
    }

    @Test
    void loginWorksCaseInsensitivelyAndIssuesToken() throws Exception {
        register("alice_01", "Str0ng!Pass");
        JsonNode body = login("ALICE_01", "Str0ng!Pass");
        assertThat(body.get("token").asText()).isNotBlank();
        assertThat(body.get("expiresIn").asInt()).isEqualTo(3600);
        assertThat(body.get("user").get("role").asText()).isEqualTo("USER");
        assertThat(login("admin", "admin").get("user").get("role").asText()).isEqualTo("ADMIN");
    }

    @Test
    void loginFailures() throws Exception {
        register("alice_01", "Str0ng!Pass");
        json(post("/api/auth/login"), "{\"username\":\"alice_01\",\"password\":\"Wrong!Pass1\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("X-Auth-Token"))
                .andExpect(jsonPath("$.message").value("Invalid username or password"));
        json(post("/api/auth/login"), "{\"username\":\"nobody\",\"password\":\"Str0ng!Pass\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid username or password"));
        json(post("/api/auth/login"), "{\"username\":\"\",\"password\":\"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.length()").value(2));

        User alice = userRepository.findByUsername("alice_01").orElseThrow();
        alice.setEnabled(false);
        userRepository.save(alice);
        json(post("/api/auth/login"), "{\"username\":\"alice_01\",\"password\":\"Str0ng!Pass\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Account is disabled"));
        json(post("/api/auth/login"), "{\"username\":\"alice_01\",\"password\":\"Wrong!Pass1\"}")
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meRequiresToken() throws Exception {
        register("alice_01", "Str0ng!Pass");
        String token = login("alice_01", "Str0ng!Pass").get("token").asText();
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice_01"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(header().exists("X-Auth-Token"));
        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required"));
    }

    private ResultActions changePassword(String token, String current, String next, String confirm) throws Exception {
        String confirmJson = confirm == null ? "" : ",\"confirmNewPassword\":\"" + confirm + "\"";
        return json(put("/api/auth/password").header(HttpHeaders.AUTHORIZATION, "Bearer " + token),
                "{\"currentPassword\":\"%s\",\"newPassword\":\"%s\"%s}".formatted(current, next, confirmJson));
    }

    @Test
    void changePasswordInvalidatesOldTokensAndKeepsCallerLoggedIn() throws Exception {
        register("alice_01", "Str0ng!Pass");
        String t1 = login("alice_01", "Str0ng!Pass").get("token").asText();
        String t2 = login("alice_01", "Str0ng!Pass").get("token").asText();

        String body = changePassword(t1, "Str0ng!Pass", "N3w#Secret", "N3w#Secret")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.user.username").value("alice_01"))
                .andReturn().getResponse().getContentAsString();
        // header must equal the body token (checked via a fresh request below)
        String newToken = objectMapper.readTree(body).get("token").asText();

        for (String old : new String[] { t1, t2 }) {
            mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + old))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("Password has been changed. Please log in again."));
        }
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + newToken))
                .andExpect(status().isOk());
        json(post("/api/auth/login"), "{\"username\":\"alice_01\",\"password\":\"Str0ng!Pass\"}")
                .andExpect(status().isUnauthorized());
        login("alice_01", "N3w#Secret");
    }

    @Test
    void changePasswordResponseHeaderCarriesNewToken() throws Exception {
        register("alice_01", "Str0ng!Pass");
        String t1 = login("alice_01", "Str0ng!Pass").get("token").asText();
        var result = changePassword(t1, "Str0ng!Pass", "N3w#Secret", "N3w#Secret").andExpect(status().isOk()).andReturn();
        String bodyToken = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
        assertThat(result.getResponse().getHeader("X-Auth-Token")).isEqualTo(bodyToken);
    }

    @Test
    void changePasswordValidationErrorsAre400AndKeepSession() throws Exception {
        register("alice_01", "Str0ng!Pass");
        String token = login("alice_01", "Str0ng!Pass").get("token").asText();

        changePassword(token, "Wrong!Pass1", "N3w#Secret", "N3w#Secret")
                .andExpect(status().isBadRequest())
                .andExpect(header().exists("X-Auth-Token"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("currentPassword"))
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Current password is incorrect"));
        changePassword(token, "Str0ng!Pass", "weak", "weak")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='newPassword')]").exists());
        changePassword(token, "Str0ng!Pass", "N3w#Secret", "Different#1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("confirmNewPassword"))
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Passwords do not match"));
        changePassword(token, "Str0ng!Pass", "N3w#Secret", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Confirm new password is required"));
        changePassword(token, "Str0ng!Pass", "Str0ng!Pass", "Str0ng!Pass")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("New password must be different from the current password"));
        changePassword(token, "Str0ng!Pass", "xALICE_01!9", "xALICE_01!9")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Password must not contain the username"));
        json(put("/api/auth/password").header(HttpHeaders.AUTHORIZATION, "Bearer " + token), "{not json")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isOk());
        login("alice_01", "Str0ng!Pass");
    }

    @Test
    void adminCanChangeOwnPassword() throws Exception {
        String token = login("admin", "admin").get("token").asText();
        changePassword(token, "admin", "Adm1n#Secret", "Adm1n#Secret").andExpect(status().isOk());
        json(post("/api/auth/login"), "{\"username\":\"admin\",\"password\":\"admin\"}").andExpect(status().isUnauthorized());
        login("admin", "Adm1n#Secret");
    }

    @Test
    void changePasswordWithoutTokenIs401() throws Exception {
        json(put("/api/auth/password"), "{}").andExpect(status().isUnauthorized());
    }
}
