package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

/** A47-A51: search on /api/tasks. */
class TaskSearchQaTest extends QaSupport {

    private String token;

    @BeforeEach
    void loginAlice() throws Exception {
        token = registerAndLogin(ALICE, ALICE_PASSWORD);
    }

    private long add(String title, String description) throws Exception {
        return createTask(token, "/api/tasks", title, description, isoIn(1, ChronoUnit.DAYS));
    }

    private List<String> search(String query) throws Exception {
        return search(token, query);
    }

    private List<String> search(String who, String query) throws Exception {
        MvcResult result = get("/api/tasks" + query, who);
        assertThat(status(result)).as(query).isEqualTo(200);
        List<String> titles = new ArrayList<>();
        for (JsonNode node : body(result)) {
            titles.add(node.get("title").asText());
        }
        return titles;
    }

    @Test
    void a47_matchesTitleAndDescriptionCaseInsensitively() throws Exception {
        add("Buy Milk", null);
        add("Call mom", "about milk");
        add("Gym", null);
        assertThat(search("?q=MILK")).containsExactlyInAnyOrder("Buy Milk", "Call mom");
    }

    @Test
    void a48_searchCombinesWithStatus() throws Exception {
        add("Buy Milk", null);
        long mom = add("Call mom", "about milk");
        patch("/api/tasks/" + mom + "/completion", token, map("completed", true));
        assertThat(search("?q=milk&status=completed")).containsExactly("Call mom");
        assertThat(search("?q=milk&status=active")).containsExactly("Buy Milk");
    }

    @Test
    void a49_noMatchGivesEmptyList() throws Exception {
        add("Buy Milk", null);
        assertThat(search("?q=zzz")).isEmpty();
    }

    @Test
    void a50_percentAndUnderscoreAreLiteral() throws Exception {
        add("50% off", null);
        add("500 items", null);
        add("a_b", null);
        add("axb", null);
        assertThat(search("?q=50%25")).containsExactly("50% off");
        assertThat(search("?q=a_b")).containsExactly("a_b");
    }

    @Test
    void a50_backslashIsLiteral() throws Exception {
        add("path c:\\temp", null);
        add("path c:/temp", null);
        assertThat(search("?q=c%3A%5Ctemp")).containsExactly("path c:\\temp");
    }

    @Test
    void a51_blankQueryReturnsAll() throws Exception {
        add("one", null);
        add("two", null);
        assertThat(search("?q=")).hasSize(2);
        assertThat(search("?q=%20%20")).hasSize(2);
    }

    @Test
    void a51_queryIsTrimmed() throws Exception {
        add("Buy Milk", null);
        assertThat(search("?q=%20milk%20")).containsExactly("Buy Milk");
    }

    @Test
    void a51_queryLongerThan100CharsRejected() throws Exception {
        MvcResult tooLong = get("/api/tasks?q=" + "a".repeat(101), token);
        assertThat(status(tooLong)).isEqualTo(400);
        assertThat(fieldMessages(tooLong, "q")).contains("Search text must be at most 100 characters");
        assertThat(status(get("/api/tasks?q=" + "a".repeat(100), token))).isEqualTo(200);
    }

    @Test
    void a51_searchNeverSeesOtherUsersTasks() throws Exception {
        add("Alice secret milk", null);
        String bob = registerAndLogin(BOB, BOB_PASSWORD);
        assertThat(search(bob, "?q=milk")).isEmpty();
        assertThat(search(bob, "")).isEmpty();
    }
}
