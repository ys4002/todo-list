package com.todoapp.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.todoapp.task.TaskRepository;
import com.todoapp.user.AdminSeeder;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(SecurityIntegrationTest.PingController.class)
class SecurityIntegrationTest {

    @TestConfiguration
    @RestController
    static class PingController {
        @GetMapping("/api/ping")
        String ping() {
            return "pong";
        }

        @GetMapping("/api/admin/ping")
        String adminPing() {
            return "admin-pong";
        }

        @DeleteMapping("/api/ping")
        void deletePing() {
            throw new com.todoapp.common.ResourceNotFoundException("Task not found");
        }
    }

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TaskRepository taskRepository;
    @Autowired
    private AdminSeeder adminSeeder;
    @Autowired
    private JwtTokenService jwtTokenService;
    @Autowired
    private JwtEncoder jwtEncoder;
    @Value("${app.jwt.issuer}")
    private String issuer;

    private User alice;
    private User admin;

    @BeforeEach
    void setUp() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        adminSeeder.seed();
        admin = userRepository.findByUsername("admin").orElseThrow();
        alice = userRepository.save(new User("alice_01", "Alice", "hash", Role.USER));
    }

    @AfterEach
    void tearDown() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        adminSeeder.seed();
    }

    private String bearer(User user) {
        return "Bearer " + jwtTokenService.generateToken(user);
    }

    private JwtTokenService serviceWithClock(JwtEncoder encoder, Instant now) {
        return new JwtTokenService(encoder, Clock.fixed(now, ZoneOffset.UTC), issuer, 60);
    }

    private ResultActions getPing(String authorization) throws Exception {
        var request = get("/api/ping");
        if (authorization != null) {
            request.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        return mockMvc.perform(request);
    }

    private void assertUnauthorized(ResultActions result, String message) throws Exception {
        result.andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("X-Auth-Token"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value(message))
                .andExpect(jsonPath("$.path").value("/api/ping"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    @Test
    void noTokenIs401() throws Exception {
        assertUnauthorized(getPing(null), "Authentication required");
    }

    @Test
    void garbageTokenIs401() throws Exception {
        assertUnauthorized(getPing("Bearer not.a.jwt"), "Authentication required");
    }

    @Test
    void expiredTokenIs401() throws Exception {
        String expired = serviceWithClock(jwtEncoder, Instant.now().minusSeconds(7200)).generateToken(alice);
        assertUnauthorized(getPing("Bearer " + expired), "Authentication required");
    }

    @Test
    void tokenSignedWithOtherSecretIs401() throws Exception {
        JwtEncoder otherEncoder = new NimbusJwtEncoder(new ImmutableSecret<>(
                new SecretKeySpec("some-other-secret-0123456789abcdefghij".getBytes(StandardCharsets.UTF_8), "HmacSHA256")));
        String forged = serviceWithClock(otherEncoder, Instant.now()).generateToken(alice);
        assertUnauthorized(getPing("Bearer " + forged), "Authentication required");
    }

    @Test
    void tamperedPayloadIs401() throws Exception {
        String token = jwtTokenService.generateToken(alice);
        String[] parts = token.split("\\.");
        String payload = new String(java.util.Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
                .replace("\"USER\"", "\"ADMIN\"");
        String tampered = parts[0] + "." + java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
        assertUnauthorized(getPing("Bearer " + tampered), "Authentication required");
    }

    @Test
    void disabledUsersTokenIs401() throws Exception {
        String token = bearer(alice);
        alice.setEnabled(false);
        userRepository.save(alice);

        assertUnauthorized(getPing(token), "Account is disabled");
    }

    @Test
    void deletedUsersTokenIs401() throws Exception {
        String token = bearer(alice);
        userRepository.delete(alice);

        assertUnauthorized(getPing(token), "Account is disabled");
    }

    @Test
    void staleTokenVersionIs401() throws Exception {
        String token = bearer(alice);
        alice.changePassword("newHash");
        userRepository.save(alice);

        assertUnauthorized(getPing(token), "Password has been changed. Please log in again.");
    }

    @Test
    void validTokenGetsRenewalHeaders() throws Exception {
        getPing(bearer(alice))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Auth-Token"))
                .andExpect(header().string("X-Auth-Expires-In", "3600"));
    }

    @Test
    void renewedTokenWorks() throws Exception {
        String renewed = getPing(bearer(alice)).andReturn().getResponse().getHeader("X-Auth-Token");

        getPing("Bearer " + renewed).andExpect(status().isOk());
    }

    @Test
    void renewalHeadersAlsoOn404() throws Exception {
        mockMvc.perform(delete("/api/ping").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isNotFound())
                .andExpect(header().exists("X-Auth-Token"))
                .andExpect(jsonPath("$.message").value("Task not found"));
    }

    @Test
    void renewalHeadersOn403() throws Exception {
        mockMvc.perform(get("/api/admin/ping").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isForbidden())
                .andExpect(header().exists("X-Auth-Token"))
                .andExpect(jsonPath("$.message").value("Access denied"))
                .andExpect(jsonPath("$.path").value("/api/admin/ping"));
    }

    @Test
    void adminEndpointsNeedAdminRole() throws Exception {
        mockMvc.perform(get("/api/admin/ping").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/ping"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void roleComesFromDatabaseNotToken() throws Exception {
        String oldUserToken = bearer(alice);
        mockMvc.perform(get("/api/admin/ping").header(HttpHeaders.AUTHORIZATION, oldUserToken))
                .andExpect(status().isForbidden());

        org.springframework.test.util.ReflectionTestUtils.setField(alice, "role", Role.ADMIN);
        userRepository.save(alice);

        mockMvc.perform(get("/api/admin/ping").header(HttpHeaders.AUTHORIZATION, oldUserToken))
                .andExpect(status().isOk());
    }

    @Test
    void publicEndpointsDoNotRequireTokenAndGetNoRenewalHeader() throws Exception {
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(header().doesNotExist("X-Auth-Token"));
    }

    @Test
    void corsPreflightAllowsFrontendOriginAndExposesHeaders() throws Exception {
        mockMvc.perform(options("/api/ping")
                        .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:3000"));

        mockMvc.perform(get("/api/ping")
                        .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                        .header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers.containsString("X-Auth-Token"),
                                org.hamcrest.Matchers.containsString("X-Auth-Expires-In"),
                                org.hamcrest.Matchers.containsString("Location"))));
    }
}
