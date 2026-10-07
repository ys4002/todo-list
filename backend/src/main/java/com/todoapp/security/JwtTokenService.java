package com.todoapp.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import com.todoapp.user.Role;
import com.todoapp.user.User;

@Service
public class JwtTokenService {

    private final JwtEncoder jwtEncoder;
    private final Clock clock;
    private final String issuer;
    private final Duration expiry;

    public JwtTokenService(JwtEncoder jwtEncoder,
            Clock clock,
            @Value("${app.jwt.issuer}") String issuer,
            @Value("${app.jwt.expiry-minutes}") long expiryMinutes) {
        this.jwtEncoder = jwtEncoder;
        this.clock = clock;
        this.issuer = issuer;
        this.expiry = Duration.ofMinutes(expiryMinutes);
    }

    public String generateToken(User user) {
        return generateToken(user.getId(), user.getUsername(), user.getRole(), user.getTokenVersion());
    }

    public String generateToken(Long userId, String username, Role role, int tokenVersion) {
        Instant issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(String.valueOf(userId))
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plus(expiry))
                .claim("username", username)
                .claim("role", role.name())
                .claim("ver", tokenVersion)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public long getExpiresInSeconds() {
        return expiry.toSeconds();
    }
}
