package com.todoapp.task;

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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.todoapp.security.JwtTokenService;
import com.todoapp.user.AdminSeeder;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TaskApiTest {

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

    private String aliceToken;
    private String bobToken;

    @BeforeEach
    void setUp() {
        clean();
        aliceToken = tokenFor(userRepository.save(new User("alice_01", "Alice", "hash", Role.USER)));
        bobToken = tokenFor(userRepository.save(new User("bob_02", "Bob", "hash", Role.USER)));
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
        builder.header(HttpHeaders.AUTHORIZATION, token);
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mockMvc.perform(builder);
    }

    private long createTask(String token, String title, String description, String dueAt) throws Exception {
        String desc = description == null ? "null" : "\"" + description + "\"";
        String response = send(post("/api/tasks"), token,
                "{\"title\":\"%s\",\"description\":%s,\"dueAt\":\"%s\"}".formatted(title, desc, dueAt))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
    }

    @Test
    void createReturns201WithLocationAndDefaults() throws Exception {
        send(post("/api/tasks"), aliceToken, "{\"title\":\"Buy groceries\",\"description\":\"Milk\",\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.matchesPattern("/api/tasks/\\d+")))
                .andExpect(jsonPath("$.completed").value(false))
                .andExpect(jsonPath("$.completedAt").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.overdue").value(false))
                .andExpect(jsonPath("$.description").value("Milk"));
        long id = createTask(aliceToken, "No desc", null, in(2));
        send(get("/api/tasks/" + id), aliceToken, null).andExpect(jsonPath("$.description").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void dueAtWithOffsetIsStoredAsUtc() throws Exception {
        long id = createTask(aliceToken, "Offset", null, "2099-12-10T22:30:00+05:30");
        send(get("/api/tasks/" + id), aliceToken, null).andExpect(jsonPath("$.dueAt").value("2099-12-10T17:00:00Z"));
        assertThat(taskRepository.findById(id).orElseThrow().getDueAt()).isEqualTo(Instant.parse("2099-12-10T17:00:00Z"));
    }

    @Test
    void listIsSortedByDueAtThenCreatedAtAndFilteredByStatus() throws Exception {
        long late = createTask(aliceToken, "late", null, in(48));
        long early = createTask(aliceToken, "early", null, in(24));
        long tieA = createTask(aliceToken, "tieA", null, in(30));
        long tieB = createTask(aliceToken, "tieB", null, in(30));
        send(patch("/api/tasks/" + early + "/completion"), aliceToken, "{\"completed\":true}").andExpect(status().isOk());

        send(get("/api/tasks"), aliceToken, null).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("early", "tieA", "tieB", "late")));
        send(get("/api/tasks?status=active"), aliceToken, null)
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("tieA", "tieB", "late")));
        send(get("/api/tasks?status=COMPLETED"), aliceToken, null)
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("early")));
        send(get("/api/tasks"), bobToken, null).andExpect(jsonPath("$").isEmpty());
        assertThat(late + early + tieA + tieB).isPositive();
    }

    @Test
    void updateAndCompletionSetAndClearCompletedAt() throws Exception {
        long id = createTask(aliceToken, "Old", "d", in(1));
        send(put("/api/tasks/" + id), aliceToken,
                "{\"title\":\"New\",\"description\":\"x\",\"dueAt\":\"" + in(5) + "\",\"completed\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("New"))
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.completedAt").isNotEmpty());
        send(patch("/api/tasks/" + id + "/completion"), aliceToken, "{\"completed\":false}")
                .andExpect(jsonPath("$.completed").value(false))
                .andExpect(jsonPath("$.completedAt").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void overdueTaskCanStillBeCompleted() throws Exception {
        long id = createTask(aliceToken, "Late", null, in(1));
        send(put("/api/tasks/" + id), aliceToken,
                "{\"title\":\"Late\",\"dueAt\":\"" + in(-24) + "\",\"completed\":false}").andExpect(status().isOk());
        send(get("/api/tasks/" + id), aliceToken, null).andExpect(jsonPath("$.overdue").value(true));
        send(patch("/api/tasks/" + id + "/completion"), aliceToken, "{\"completed\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.overdue").value(false));
    }

    @Test
    void deleteThenNotFound() throws Exception {
        long id = createTask(aliceToken, "Bye", null, in(1));
        send(delete("/api/tasks/" + id), aliceToken, null).andExpect(status().isNoContent());
        send(get("/api/tasks/" + id), aliceToken, null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Task not found"));
        send(delete("/api/tasks/" + id), aliceToken, null).andExpect(status().isNotFound());
    }

    @Test
    void validationErrors() throws Exception {
        send(post("/api/tasks"), aliceToken, "{\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("title"));
        send(post("/api/tasks"), aliceToken, "{\"title\":\"   \",\"dueAt\":\"" + in(1) + "\"}").andExpect(status().isBadRequest());
        send(post("/api/tasks"), aliceToken, "{\"title\":\"" + "t".repeat(101) + "\",\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isBadRequest());
        send(post("/api/tasks"), aliceToken, "{\"title\":\"" + "t".repeat(100) + "\",\"description\":\"" + "d".repeat(1000)
                + "\",\"dueAt\":\"" + in(1) + "\"}").andExpect(status().isCreated());
        send(post("/api/tasks"), aliceToken, "{\"title\":\"t\",\"description\":\"" + "d".repeat(1001) + "\",\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("description"));
        send(post("/api/tasks"), aliceToken, "{\"title\":\"t\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Due date and time is required"));
        send(post("/api/tasks"), aliceToken, "{\"title\":\"t\",\"dueAt\":\"" + in(-1) + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Due date and time cannot be in the past"));
        send(post("/api/tasks"), aliceToken, "{\"title\":\"t\",\"dueAt\":\"" + Instant.now().minusSeconds(120) + "\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.overdue").value(true));
        for (String bad : new String[] { "2026-13-40T10:00:00Z", "2026-10-10", "2026-10-10T10:00" }) {
            send(post("/api/tasks"), aliceToken, "{\"title\":\"t\",\"dueAt\":\"" + bad + "\"}")
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Malformed request"));
        }
    }

    @Test
    void putAndPatchValidation() throws Exception {
        long id = createTask(aliceToken, "t", null, in(1));
        send(put("/api/tasks/" + id), aliceToken, "{\"title\":\"t\",\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("completed"));
        send(put("/api/tasks/" + id), aliceToken, "{\"title\":\"t\",\"dueAt\":\"2000-01-01T00:00:00Z\",\"completed\":false}")
                .andExpect(status().isOk());
        send(patch("/api/tasks/" + id + "/completion"), aliceToken, "{}").andExpect(status().isBadRequest());
        send(patch("/api/tasks/" + id + "/completion"), aliceToken, "{\"completed\":\"yes\"}").andExpect(status().isBadRequest());
    }

    @Test
    void badStatusParamBadIdUnknownIdAndWrongMethod() throws Exception {
        send(get("/api/tasks?status=done"), aliceToken, null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Malformed request"));
        send(get("/api/tasks/abc"), aliceToken, null).andExpect(status().isBadRequest());
        send(get("/api/tasks/999999"), aliceToken, null).andExpect(status().isNotFound());
        send(delete("/api/tasks/999999"), aliceToken, null).andExpect(status().isNotFound());
        send(delete("/api/tasks"), aliceToken, null).andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.message").value("Method not allowed"));
    }

    @Test
    void extraBodyFieldsAreIgnoredAndUnicodeIsStoredAsSent() throws Exception {
        String title = "Ünïcode ✓ 😀 <script>alert(1)</script>";
        String response = send(post("/api/tasks"), aliceToken,
                "{\"id\":999,\"userId\":1,\"completed\":true,\"title\":\"" + title + "\",\"dueAt\":\"" + in(1) + "\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.completed").value(false))
                .andExpect(jsonPath("$.title").value(title))
                .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        assertThat(id).isNotEqualTo(999);
        assertThat(taskRepository.findById(id).orElseThrow().getUserId())
                .isEqualTo(userRepository.findByUsername("alice_01").orElseThrow().getId());
    }

    @Test
    void otherUsersTaskIsNotFoundForEveryOperationAndUnchanged() throws Exception {
        long id = createTask(aliceToken, "Alice only", null, in(1));
        send(get("/api/tasks/" + id), bobToken, null).andExpect(status().isNotFound());
        send(put("/api/tasks/" + id), bobToken, "{\"title\":\"hack\",\"dueAt\":\"" + in(1) + "\",\"completed\":true}")
                .andExpect(status().isNotFound());
        send(patch("/api/tasks/" + id + "/completion"), bobToken, "{\"completed\":true}").andExpect(status().isNotFound());
        send(delete("/api/tasks/" + id), bobToken, null).andExpect(status().isNotFound());
        send(get("/api/tasks/" + id), aliceToken, null)
                .andExpect(jsonPath("$.title").value("Alice only")).andExpect(jsonPath("$.completed").value(false));
        send(get("/api/tasks"), bobToken, null).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void searchMatchesTitleAndDescriptionCombinedWithStatusAndEscapesWildcards() throws Exception {
        createTask(aliceToken, "Buy Milk", null, in(1));
        long mom = createTask(aliceToken, "Call mom", "about milk", in(2));
        createTask(aliceToken, "Gym", null, in(3));
        createTask(aliceToken, "50% off", null, in(4));
        createTask(aliceToken, "500 items", null, in(5));
        createTask(aliceToken, "a_b", null, in(6));
        createTask(aliceToken, "axb", null, in(7));
        send(patch("/api/tasks/" + mom + "/completion"), aliceToken, "{\"completed\":true}");

        send(get("/api/tasks?q=MILK"), aliceToken, null)
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("Buy Milk", "Call mom")));
        send(get("/api/tasks?q=milk&status=completed"), aliceToken, null)
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("Call mom")));
        send(get("/api/tasks?q=zzz"), aliceToken, null).andExpect(jsonPath("$").isEmpty());
        send(get("/api/tasks").queryParam("q", "50%"), aliceToken, null)
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("50% off")));
        send(get("/api/tasks?q=a_b"), aliceToken, null)
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.contains("a_b")));
        send(get("/api/tasks?q="), aliceToken, null).andExpect(jsonPath("$.length()").value(7));
        send(get("/api/tasks?q=" + "x".repeat(101)), aliceToken, null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("q"));
        send(get("/api/tasks?q=milk"), bobToken, null).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void endpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/tasks")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/tasks").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }
}
