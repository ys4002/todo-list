package com.todoapp.qa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** SS1-SS5: sliding session via X-Auth-Token / X-Auth-Expires-In. */
class SessionQaTest extends QaSupport {

    private String token;

    @BeforeEach
    void loginAlice() throws Exception {
        token = registerAndLogin(ALICE, ALICE_PASSWORD);
    }

    private void assertRenewed(MvcResult result) throws Exception {
        String renewed = header(result, "X-Auth-Token");
        assertThat(renewed).as("X-Auth-Token on status %d", status(result)).isNotBlank();
        assertThat(header(result, "X-Auth-Expires-In")).isEqualTo("3600");
        Instant exp = Instant.ofEpochSecond(payload(renewed).get("exp").asLong());
        assertThat(exp).isCloseTo(Instant.now().plus(60, ChronoUnit.MINUTES), within(Duration.ofSeconds(30)));
    }

    @Test
    void ss1_everyAuthenticatedMethodRenews() throws Exception {
        MvcResult created = post("/api/tasks", token, taskBody("t", null, isoIn(1, ChronoUnit.DAYS)));
        assertThat(status(created)).isEqualTo(201);
        assertRenewed(created);
        long id = body(created).get("id").asLong();

        assertRenewed(get("/api/tasks", token));
        assertRenewed(get("/api/tasks/" + id, token));
        MvcResult updated = put("/api/tasks/" + id, token, taskPut("t2", null, isoIn(2, ChronoUnit.DAYS), false));
        assertThat(status(updated)).isEqualTo(200);
        assertRenewed(updated);
        MvcResult completed = patch("/api/tasks/" + id + "/completion", token, map("completed", true));
        assertThat(status(completed)).isEqualTo(200);
        assertRenewed(completed);
        MvcResult deleted = delete("/api/tasks/" + id, token);
        assertThat(status(deleted)).isEqualTo(204);
        assertRenewed(deleted);
        assertRenewed(get("/api/auth/me", token));
    }

    @Test
    void ss1_renewedTokenWorks() throws Exception {
        String renewed = header(get("/api/tasks", token), "X-Auth-Token");
        assertThat(status(get("/api/tasks", renewed))).isEqualTo(200);
    }

    @Test
    void ss2_tokenAboutToExpireGetsAFullHourBack() throws Exception {
        Instant now = Instant.now();
        Instant originalExp = now.plus(5, ChronoUnit.MINUTES);
        String shortLived = mintToken(ALICE, now.minus(55, ChronoUnit.MINUTES), originalExp);
        MvcResult result = get("/api/tasks", shortLived);
        assertThat(status(result)).isEqualTo(200);
        Instant newExp = Instant.ofEpochSecond(payload(header(result, "X-Auth-Token")).get("exp").asLong());
        assertThat(newExp).isAfter(originalExp.plus(50, ChronoUnit.MINUTES));
        assertThat(newExp).isCloseTo(now.plus(60, ChronoUnit.MINUTES), within(Duration.ofSeconds(30)));
    }

    @Test
    void ss3_headerPresentOn400403And404() throws Exception {
        MvcResult badRequest = get("/api/tasks?status=bogus", token);
        assertThat(status(badRequest)).isEqualTo(400);
        assertRenewed(badRequest);

        MvcResult notFound = get("/api/tasks/999999", token);
        assertThat(status(notFound)).isEqualTo(404);
        assertRenewed(notFound);

        MvcResult forbidden = get("/api/admin/users", token);
        assertThat(status(forbidden)).isEqualTo(403);
        assertRenewed(forbidden);

        MvcResult validation = post("/api/tasks", token, map("title", ""));
        assertThat(status(validation)).isEqualTo(400);
        assertRenewed(validation);
    }

    @Test
    void ss4_noHeaderOn401LoginAndRegister() throws Exception {
        MvcResult noToken = get("/api/tasks", null);
        assertThat(status(noToken)).isEqualTo(401);
        assertThat(header(noToken, "X-Auth-Token")).isNull();

        MvcResult garbage = get("/api/tasks", "garbage");
        assertThat(status(garbage)).isEqualTo(401);
        assertThat(header(garbage, "X-Auth-Token")).isNull();

        MvcResult login = loginRaw(ALICE, ALICE_PASSWORD);
        assertThat(status(login)).isEqualTo(200);
        assertThat(header(login, "X-Auth-Token")).isNull();

        MvcResult register = register(BOB, "Bob", BOB_PASSWORD, BOB_PASSWORD);
        assertThat(status(register)).isEqualTo(201);
        assertThat(header(register, "X-Auth-Token")).isNull();
        assertThat(header(register, "X-Auth-Expires-In")).isNull();
    }

    @Test
    void ss5_expiredTokenRejectedWithoutRenewal() throws Exception {
        MvcResult result = get("/api/tasks", expiredToken(ALICE));
        assertThat(status(result)).isEqualTo(401);
        assertThat(hasMessage(result, "Authentication required")).isTrue();
        assertThat(header(result, "X-Auth-Token")).isNull();
        assertThat(header(result, "X-Auth-Expires-In")).isNull();
    }
}
