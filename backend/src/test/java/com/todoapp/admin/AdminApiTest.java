package com.todoapp.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.todoapp.security.JwtTokenService;
import com.todoapp.task.TaskRepository;
import com.todoapp.user.AdminSeeder;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminApiTest {

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
    @Autowired
    private JwtTokenService jwtTokenService;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private User admin;
    private User alice;
    private User bob;
    private String adminToken;
    private String aliceToken;

    @BeforeEach
    void setUp() {
        clean();
        admin = userRepository.findByUsername("admin").orElseThrow();
        alice = userRepository.save(new User("alice_01", "Alice Smith", passwordEncoder.encode("Str0ng!Pass"), Role.USER));
        bob = userRepository.save(new User("bob_02", "Bob Jones", passwordEncoder.encode("An0ther#Pass"), Role.USER));
        adminToken = tokenFor(admin);
        aliceToken = tokenFor(alice);
    }

    @AfterEach
    void clean() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        adminSeeder.seed();
    }

    private String tokenFor(User user) {
        return "Bearer " + jwtTokenService.generateToken(user);
    }

    private String in(long hours) {
        return Instant.now().plus(hours, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS).toString();
    }

    private ResultActions send(MockHttpServletRequestBuilder builder, String token, String body) throws Exception {
        if (token != null) {
            builder.header(HttpHeaders.AUTHORIZATION, token);
        }
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mockMvc.perform(builder);
    }

    private long createTask(User owner, String title, String description) throws Exception {
        String response = send(post("/api/admin/users/" + owner.getId() + "/tasks"), adminToken,
                "{\"title\":\"%s\",\"description\":\"%s\",\"dueAt\":\"%s\"}".formatted(title, description, in(5)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
    }

    @Test
    void nonAdminGets403OnEveryAdminEndpointAndAnonymousGets401() throws Exception {
        String[] paths = { "/api/admin/users", "/api/admin/users/" + alice.getId(),
                "/api/admin/users/" + alice.getId() + "/tasks" };
        for (String path : paths) {
            send(get(path), aliceToken, null).andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.message").value("Access denied"));
            send(get(path), null, null).andExpect(status().isUnauthorized());
        }
        send(patch("/api/admin/users/" + bob.getId() + "/status"), aliceToken, "{\"enabled\":false}")
                .andExpect(status().isForbidden());
        send(put("/api/admin/users/" + bob.getId() + "/password"), aliceToken,
                "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"N3w#Secret\"}").andExpect(status().isForbidden());
        send(put("/api/admin/users/" + alice.getId() + "/password"), aliceToken,
                "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"N3w#Secret\"}").andExpect(status().isForbidden());
        send(put("/api/admin/users/" + alice.getId() + "/password"), null,
                "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"N3w#Secret\"}").andExpect(status().isUnauthorized());
    }

    @Test
    void listUsersWithCountsSortedAndSearchable() throws Exception {
        createTask(alice, "one", "d");
        long done = createTask(alice, "two", "d");
        send(patch("/api/admin/users/" + alice.getId() + "/tasks/" + done + "/completion"), adminToken, "{\"completed\":true}");

        send(get("/api/admin/users"), adminToken, null).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].username").value(Matchers.contains("admin", "alice_01", "bob_02")))
                .andExpect(jsonPath("$[1].taskCount").value(2))
                .andExpect(jsonPath("$[1].openTaskCount").value(1))
                .andExpect(jsonPath("$[1].enabled").value(true))
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist());
        send(get("/api/admin/users?q=ALI"), adminToken, null).andExpect(jsonPath("$[*].username").value(Matchers.contains("alice_01")));
        send(get("/api/admin/users?q=Smith"), adminToken, null).andExpect(jsonPath("$[*].username").value(Matchers.contains("alice_01")));
        send(get("/api/admin/users?q=zzz"), adminToken, null).andExpect(jsonPath("$").isEmpty());
        send(get("/api/admin/users?q=" + "x".repeat(101)), adminToken, null).andExpect(status().isBadRequest());
    }

    @Test
    void getOneUser() throws Exception {
        send(get("/api/admin/users/" + alice.getId()), adminToken, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("alice_01"));
        send(get("/api/admin/users/999999"), adminToken, null)
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("User not found"));
        send(get("/api/admin/users/abc"), adminToken, null).andExpect(status().isBadRequest());
    }

    @Test
    void disableAndEnableUserLifecycle() throws Exception {
        String bobToken = tokenFor(bob);
        send(patch("/api/admin/users/" + bob.getId() + "/status"), adminToken, "{\"enabled\":false}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        send(get("/api/tasks"), bobToken, null).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Account is disabled"));
        send(post("/api/auth/login"), null, "{\"username\":\"bob_02\",\"password\":\"An0ther#Pass\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("Account is disabled"));
        send(post("/api/auth/login"), null, "{\"username\":\"bob_02\",\"password\":\"wrong\"}").andExpect(status().isUnauthorized());
        send(patch("/api/admin/users/" + bob.getId() + "/status"), adminToken, "{\"enabled\":true}").andExpect(status().isOk());
        send(post("/api/auth/login"), null, "{\"username\":\"bob_02\",\"password\":\"An0ther#Pass\"}").andExpect(status().isOk());
    }

    @Test
    void adminCannotDisableSelfAndStatusBodyIsValidated() throws Exception {
        send(patch("/api/admin/users/" + admin.getId() + "/status"), adminToken, "{\"enabled\":false}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("You cannot disable your own account"));
        assertThat(userRepository.findById(admin.getId()).orElseThrow().isEnabled()).isTrue();
        send(patch("/api/admin/users/" + bob.getId() + "/status"), adminToken, "{}").andExpect(status().isBadRequest());
        send(patch("/api/admin/users/" + bob.getId() + "/status"), adminToken, "{\"enabled\":\"no\"}").andExpect(status().isBadRequest());
        send(patch("/api/admin/users/999999/status"), adminToken, "{\"enabled\":false}").andExpect(status().isNotFound());
    }

    @Test
    void adminManagesAnotherUsersTasks() throws Exception {
        String base = "/api/admin/users/" + alice.getId() + "/tasks";
        send(post(base), adminToken, "{\"title\":\"By admin\",\"description\":\"milk\",\"dueAt\":\"" + in(3) + "\"}")
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", Matchers.matchesPattern(base + "/\\d+")));
        send(post(base), adminToken, "{\"title\":\"\",\"dueAt\":\"" + in(3) + "\"}").andExpect(status().isBadRequest());
        send(get("/api/tasks"), aliceToken, null).andExpect(jsonPath("$[0].title").value("By admin"));

        long id = taskRepository.findAll().get(0).getId();
        send(get(base + "?status=active&q=milk"), adminToken, null).andExpect(jsonPath("$.length()").value(1));
        send(get(base + "/" + id), adminToken, null).andExpect(status().isOk());
        send(put(base + "/" + id), adminToken, "{\"title\":\"Edited\",\"dueAt\":\"" + in(4) + "\",\"completed\":false}")
                .andExpect(status().isOk());
        send(get("/api/tasks"), aliceToken, null).andExpect(jsonPath("$[0].title").value("Edited"));
        send(patch(base + "/" + id + "/completion"), adminToken, "{\"completed\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.completed").value(true));
        send(patch(base + "/" + id + "/completion"), adminToken, "{\"completed\":false}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.completed").value(false));
        send(delete(base + "/" + id), adminToken, null).andExpect(status().isNoContent());
        send(get("/api/tasks"), aliceToken, null).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void adminTaskEndpointsCheckUserAndOwnership() throws Exception {
        long aliceTask = createTask(alice, "Alice's", "d");
        send(get("/api/admin/users/" + bob.getId() + "/tasks/" + aliceTask), adminToken, null)
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Task not found"));
        send(delete("/api/admin/users/" + bob.getId() + "/tasks/" + aliceTask), adminToken, null).andExpect(status().isNotFound());
        send(get("/api/admin/users/999999/tasks"), adminToken, null)
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("User not found"));
        send(post("/api/admin/users/999999/tasks"), adminToken, "{\"title\":\"t\",\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isNotFound());
        assertThat(taskRepository.findById(aliceTask)).isPresent();
    }

    @Test
    void adminOwnTasksBehaveLikeANormalUser() throws Exception {
        send(post("/api/tasks"), adminToken, "{\"title\":\"Mine\",\"dueAt\":\"" + in(1) + "\"}").andExpect(status().isCreated());
        send(post("/api/tasks"), adminToken, "{\"dueAt\":\"" + in(1) + "\"}").andExpect(status().isBadRequest());
        send(get("/api/tasks"), adminToken, null).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void resetOtherUsersPasswordEndsTheirSessions() throws Exception {
        send(put("/api/admin/users/" + alice.getId() + "/password"), adminToken,
                "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"N3w#Secret\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice_01"))
                .andExpect(jsonPath("$.password").doesNotExist());
        send(get("/api/tasks"), aliceToken, null).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Password has been changed. Please log in again."));
        send(post("/api/auth/login"), null, "{\"username\":\"alice_01\",\"password\":\"N3w#Secret\"}").andExpect(status().isOk());
        send(post("/api/auth/login"), null, "{\"username\":\"alice_01\",\"password\":\"Str0ng!Pass\"}").andExpect(status().isUnauthorized());
        // the admin's own token still works and was not replaced by a different user's token
        send(get("/api/admin/users"), adminToken, null).andExpect(status().isOk());
    }

    @Test
    void resetValidationAndSamePasswordIsAllowed() throws Exception {
        String url = "/api/admin/users/" + alice.getId() + "/password";
        send(put(url), adminToken, "{\"newPassword\":\"weak\",\"confirmNewPassword\":\"weak\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("newPassword"));
        send(put(url), adminToken, "{\"newPassword\":\"xAlice_01!9\",\"confirmNewPassword\":\"xAlice_01!9\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Password must not contain the username"));
        send(put(url), adminToken, "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"Other#Secret1\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("confirmNewPassword"));
        send(put("/api/admin/users/999999/password"), adminToken,
                "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"N3w#Secret\"}").andExpect(status().isNotFound());
        send(put(url), adminToken, "{\"newPassword\":\"Str0ng!Pass\",\"confirmNewPassword\":\"Str0ng!Pass\"}")
                .andExpect(status().isOk());
    }

    @Test
    void resetDisabledUsersPasswordKeepsThemDisabled() throws Exception {
        send(patch("/api/admin/users/" + bob.getId() + "/status"), adminToken, "{\"enabled\":false}").andExpect(status().isOk());
        send(put("/api/admin/users/" + bob.getId() + "/password"), adminToken,
                "{\"newPassword\":\"N3w#Secret\",\"confirmNewPassword\":\"N3w#Secret\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        send(post("/api/auth/login"), null, "{\"username\":\"bob_02\",\"password\":\"N3w#Secret\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("Account is disabled"));
    }

    @Test
    void adminResettingOwnPasswordGetsNewTokenAndKeepsWorking() throws Exception {
        var result = send(put("/api/admin/users/" + admin.getId() + "/password"), adminToken,
                "{\"newPassword\":\"Adm1n#Secret\",\"confirmNewPassword\":\"Adm1n#Secret\"}")
                .andExpect(status().isOk()).andReturn();
        String newToken = result.getResponse().getHeader("X-Auth-Token");
        assertThat(newToken).isNotBlank();

        send(get("/api/admin/users"), "Bearer " + newToken, null).andExpect(status().isOk());
        send(get("/api/admin/users"), adminToken, null).andExpect(status().isUnauthorized());
        send(post("/api/auth/login"), null, "{\"username\":\"admin\",\"password\":\"admin\"}").andExpect(status().isUnauthorized());
        send(post("/api/auth/login"), null, "{\"username\":\"admin\",\"password\":\"Adm1n#Secret\"}").andExpect(status().isOk());

        // restarting (seeder runs again) must not reset the changed password
        adminSeeder.seed();
        send(post("/api/auth/login"), null, "{\"username\":\"admin\",\"password\":\"Adm1n#Secret\"}").andExpect(status().isOk());
        assertThat(userRepository.findAll().stream().filter(u -> u.getRole() == Role.ADMIN)).hasSize(1);
    }
}
