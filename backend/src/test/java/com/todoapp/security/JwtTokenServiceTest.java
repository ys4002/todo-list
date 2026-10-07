package com.todoapp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.todoapp.user.Role;
import com.todoapp.user.User;

class JwtTokenServiceTest {

    private static final String SECRET = "unit-test-secret-0123456789abcdefghij";
    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

    private final SecretKeySpec key = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");

    private JwtDecoder decoderIgnoringExpiry() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(token -> OAuth2TokenValidatorResult.success());
        return decoder;
    }

    @Test
    void generatedTokenCarriesExpectedClaims() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        JwtTokenService service = new JwtTokenService(new NimbusJwtEncoder(new ImmutableSecret<>(key)), clock, "todo-app", 60);
        JwtDecoder decoder = decoderIgnoringExpiry();

        String token = service.generateToken(7L, "alice_01", Role.USER, 3);
        Jwt jwt = decoder.decode(token);

        assertThat(jwt.getSubject()).isEqualTo("7");
        assertThat(jwt.<String>getClaim("username")).isEqualTo("alice_01");
        assertThat(jwt.<String>getClaim("role")).isEqualTo("USER");
        assertThat(jwt.<Number>getClaim("ver").intValue()).isEqualTo(3);
        assertThat(jwt.getClaimAsString("iss")).isEqualTo("todo-app");
        assertThat(jwt.getIssuedAt()).isEqualTo(NOW);
        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt())).isEqualTo(Duration.ofMinutes(60));
        assertThat(service.getExpiresInSeconds()).isEqualTo(3600);
    }

    @Test
    void expiryFollowsConfiguration() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        JwtTokenService service = new JwtTokenService(new NimbusJwtEncoder(new ImmutableSecret<>(key)), clock, "todo-app", 2);
        JwtDecoder decoder = decoderIgnoringExpiry();

        Jwt jwt = decoder.decode(service.generateToken(new User("bob_02", "Bob", "hash", Role.ADMIN)));

        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt())).isEqualTo(Duration.ofMinutes(2));
        assertThat(jwt.<String>getClaim("role")).isEqualTo("ADMIN");
        assertThat(service.getExpiresInSeconds()).isEqualTo(120);
    }
}
