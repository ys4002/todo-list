package com.todoapp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@SpringBootTest(properties = "app.cors.allowed-origins=https://todo.vercel.app,https://todo-*-team.vercel.app")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CorsConfigurationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private JwtTokenService jwtTokenService;

    private MvcResult preflight(String origin) throws Exception {
        return mockMvc.perform(options("/api/tasks/1/completion")
                .header(HttpHeaders.ORIGIN, origin)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                .andReturn();
    }

    @Test
    void exactAndPatternOriginsArePreflightApprovedWithPatch() throws Exception {
        for (String origin : List.of("https://todo.vercel.app", "https://todo-git-x-team.vercel.app")) {
            MvcResult result = preflight(origin);
            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(origin);
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS)).contains("PATCH");
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS))
                    .containsIgnoringCase("authorization");
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS)).isNull();
        }
    }

    @Test
    void actualRequestExposesTokenHeaders() throws Exception {
        String suffix = Long.toString(System.nanoTime() % 1_000_000);
        User user = userRepository.save(new User("cors_" + suffix, "Cors", "hash", Role.USER));
        try {
            MvcResult result = mockMvc.perform(get("/api/tasks")
                    .header(HttpHeaders.ORIGIN, "https://todo.vercel.app")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtTokenService.generateToken(user)))
                    .andReturn();
            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS)).isNull();
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS))
                    .contains("X-Auth-Token", "X-Auth-Expires-In", "Location");
        } finally {
            userRepository.delete(user);
        }
    }

    @Test
    void unlistedOriginsGetNoCorsApproval() throws Exception {
        for (String origin : List.of("https://vercel.app", "https://evil.vercel.app",
                "http://localhost:3000", "http://evil.example", "https://todo.vercel.app.evil.example")) {
            MvcResult result = preflight(origin);
            assertThat(result.getResponse().getStatus()).isEqualTo(403);
            assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
        }
    }
}
