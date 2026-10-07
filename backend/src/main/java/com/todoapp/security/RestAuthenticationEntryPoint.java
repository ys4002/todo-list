package com.todoapp.security;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.CredentialsExpiredException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.todoapp.common.ApiError;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    static final String DISABLED_MESSAGE = "Account is disabled";
    static final String PASSWORD_CHANGED_MESSAGE = "Password has been changed. Please log in again.";
    static final String AUTH_REQUIRED_MESSAGE = "Authentication required";

    private final ObjectMapper objectMapper;

    public RestAuthenticationEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        String message = AUTH_REQUIRED_MESSAGE;
        if (authException instanceof DisabledException) {
            message = DISABLED_MESSAGE;
        } else if (authException instanceof CredentialsExpiredException) {
            message = PASSWORD_CHANGED_MESSAGE;
        }
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType("application/json;charset=UTF-8");
        objectMapper.writeValue(response.getOutputStream(),
                ApiError.of(HttpStatus.UNAUTHORIZED, message, request.getRequestURI()));
    }
}
