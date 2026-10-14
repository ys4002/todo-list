package com.todoapp.config;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.todoapp.security.JwtTokenService;
import com.todoapp.security.RestAccessDeniedHandler;
import com.todoapp.security.RestAuthenticationEntryPoint;
import com.todoapp.security.TokenRenewalFilter;
import com.todoapp.security.UserJwtAuthenticationConverter;

@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
            JwtDecoder jwtDecoder,
            UserJwtAuthenticationConverter authenticationConverter,
            JwtTokenService jwtTokenService,
            RestAuthenticationEntryPoint entryPoint,
            RestAccessDeniedHandler accessDeniedHandler) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                        .jwt(jwt -> jwt
                                .decoder(jwtDecoder)
                                .jwtAuthenticationConverter(authenticationConverter)))
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .addFilterAfter(new TokenRenewalFilter(jwtTokenService), BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") String allowedOrigins) {
        List<String> origins = parseAllowedOrigins(allowedOrigins);
        log.info("CORS allowed origins: {}", origins);
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(origins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setExposedHeaders(List.of("Location", TokenRenewalFilter.TOKEN_HEADER,
                TokenRenewalFilter.EXPIRES_IN_HEADER));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    /**
     * Splits a comma-separated origin list: trims entries, drops blanks and one trailing slash.
     * A bare {@code *} or an empty result is rejected so the API is never open to every origin.
     * Entries may be exact origins or explicit wildcard patterns such as {@code https://app-*-team.vercel.app}.
     */
    static List<String> parseAllowedOrigins(String raw) {
        List<String> origins = new ArrayList<>();
        if (raw != null) {
            for (String entry : raw.split(",")) {
                String origin = entry.trim();
                if (origin.endsWith("/")) {
                    origin = origin.substring(0, origin.length() - 1);
                }
                if (origin.isEmpty()) {
                    continue;
                }
                if (origin.equals("*")) {
                    throw new IllegalStateException(
                            "app.cors.allowed-origins must not be '*'; list exact origins or explicit patterns");
                }
                origins.add(origin);
            }
        }
        if (origins.isEmpty()) {
            throw new IllegalStateException(
                    "app.cors.allowed-origins (CORS_ALLOWED_ORIGINS) must list at least one origin");
        }
        return List.copyOf(origins);
    }
}
