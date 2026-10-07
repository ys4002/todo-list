package com.todoapp.task;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.todoapp.common.SearchQueryUtils;
import com.todoapp.user.AdminSeeder;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;
import com.todoapp.user.UserSummary;

@SpringBootTest
@ActiveProfiles("test")
class RepositoryTest {

    private static final Instant BASE = Instant.parse("2030-01-01T00:00:00Z");
    private static final char ESC = SearchQueryUtils.ESCAPE_CHAR;

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TaskRepository taskRepository;
    @Autowired
    private AdminSeeder adminSeeder;

    private User alice;
    private User bob;

    @BeforeEach
    void setUp() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        alice = userRepository.save(new User("alice_01", "Alice Smith", "hash", Role.USER));
        bob = userRepository.save(new User("bob_02", "Bob Jones", "hash", Role.USER));
    }

    @AfterEach
    void restoreAdmin() {
        taskRepository.deleteAll();
        userRepository.deleteAll();
        adminSeeder.seed();
    }

    private Task save(User owner, String title, String description, Instant dueAt, boolean completed) {
        Task task = new Task(owner.getId(), title, description, dueAt);
        task.setCompleted(completed, BASE);
        return taskRepository.save(task);
    }

    private List<String> titles(User owner, Boolean completed, String query) {
        return taskRepository.search(owner.getId(), completed, SearchQueryUtils.toLikePattern(query), ESC)
                .stream().map(Task::getTitle).toList();
    }

    @Test
    void usernameLookups() {
        assertThat(userRepository.findByUsername("alice_01")).isPresent();
        assertThat(userRepository.findByUsername("nobody")).isEmpty();
        assertThat(userRepository.existsByUsername("bob_02")).isTrue();
        assertThat(userRepository.existsByUsername("nobody")).isFalse();
    }

    @Test
    void findByIdAndUserIdEnforcesOwnership() {
        Task task = save(alice, "Alice task", null, BASE, false);

        assertThat(taskRepository.findByIdAndUserId(task.getId(), alice.getId())).isPresent();
        assertThat(taskRepository.findByIdAndUserId(task.getId(), bob.getId())).isEmpty();
    }

    @Test
    void searchOnlyReturnsOwnersTasksSortedByDueThenCreated() {
        save(alice, "late", null, BASE.plusSeconds(7200), false);
        save(alice, "early", null, BASE, false);
        save(alice, "tie-first", null, BASE.plusSeconds(3600), false);
        save(alice, "tie-second", null, BASE.plusSeconds(3600), false);
        save(bob, "bob task", null, BASE, false);

        assertThat(titles(alice, null, null)).containsExactly("early", "tie-first", "tie-second", "late");
        assertThat(titles(bob, null, null)).containsExactly("bob task");
    }

    @Test
    void searchFiltersByStatus() {
        save(alice, "open", null, BASE, false);
        save(alice, "done", null, BASE, true);

        assertThat(titles(alice, false, null)).containsExactly("open");
        assertThat(titles(alice, true, null)).containsExactly("done");
        assertThat(titles(alice, null, null)).hasSize(2);
    }

    @Test
    void searchMatchesTitleOrDescriptionCaseInsensitively() {
        save(alice, "Buy Milk", null, BASE, false);
        save(alice, "Call mom", "about milk", BASE.plusSeconds(1), true);
        save(alice, "Gym", null, BASE.plusSeconds(2), false);

        assertThat(titles(alice, null, "MILK")).containsExactly("Buy Milk", "Call mom");
        assertThat(titles(alice, true, "milk")).containsExactly("Call mom");
        assertThat(titles(alice, null, "zzz")).isEmpty();
        assertThat(titles(bob, null, "milk")).isEmpty();
    }

    @Test
    void searchTreatsWildcardsLiterally() {
        save(alice, "50% off", null, BASE, false);
        save(alice, "500 items", null, BASE.plusSeconds(1), false);
        save(alice, "a_b", null, BASE.plusSeconds(2), false);
        save(alice, "axb", null, BASE.plusSeconds(3), false);
        save(alice, "back\\slash", null, BASE.plusSeconds(4), false);

        assertThat(titles(alice, null, "50%")).containsExactly("50% off");
        assertThat(titles(alice, null, "a_b")).containsExactly("a_b");
        assertThat(titles(alice, null, "\\")).containsExactly("back\\slash");
    }

    @Test
    void adminSearchCountsTasksAndSortsByUsername() {
        save(alice, "one", null, BASE, false);
        save(alice, "two", null, BASE, true);
        save(alice, "three", null, BASE, false);

        List<UserSummary> all = userRepository.searchSummaries(null, ESC);
        assertThat(all).extracting(summary -> summary.user().getUsername()).containsExactly("alice_01", "bob_02");
        assertThat(all.get(0).taskCount()).isEqualTo(3);
        assertThat(all.get(0).openTaskCount()).isEqualTo(2);
        assertThat(all.get(1).taskCount()).isZero();
        assertThat(all.get(1).openTaskCount()).isZero();
    }

    @Test
    void adminSearchMatchesUsernameOrName() {
        assertThat(userRepository.searchSummaries(SearchQueryUtils.toLikePattern("ALI"), ESC))
                .extracting(summary -> summary.user().getUsername()).containsExactly("alice_01");
        assertThat(userRepository.searchSummaries(SearchQueryUtils.toLikePattern("Jones"), ESC))
                .extracting(summary -> summary.user().getUsername()).containsExactly("bob_02");
        assertThat(userRepository.searchSummaries(SearchQueryUtils.toLikePattern("zzz"), ESC)).isEmpty();
    }

    @Test
    void summaryById() {
        save(alice, "one", null, BASE, false);

        UserSummary summary = userRepository.findSummaryById(alice.getId()).orElseThrow();
        assertThat(summary.taskCount()).isEqualTo(1);
        assertThat(userRepository.findSummaryById(-1L)).isEmpty();
    }
}
