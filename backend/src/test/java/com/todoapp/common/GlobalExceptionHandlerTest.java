package com.todoapp.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
    private final MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/test");

    private void assertBody(ResponseEntity<ApiError> response, int status, String error, String message) {
        assertThat(response.getStatusCode().value()).isEqualTo(status);
        ApiError body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.status()).isEqualTo(status);
        assertThat(body.error()).isEqualTo(error);
        assertThat(body.message()).isEqualTo(message);
        assertThat(body.path()).isEqualTo("/api/test");
        assertThat(body.timestamp()).isNotNull();
        assertThat(body.fieldErrors()).isNotNull();
    }

    @Test
    void beanValidationMapsFieldErrors() throws Exception {
        BeanPropertyBindingResult result = new BeanPropertyBindingResult(new Object(), "request");
        result.addError(new FieldError("request", "confirmPassword", "Passwords do not match"));
        result.addError(new FieldError("request", "confirmPassword", "Confirm password is required"));
        MethodArgumentNotValidException ex = new MethodArgumentNotValidException(
                new org.springframework.core.MethodParameter(
                        GlobalExceptionHandlerTest.class.getDeclaredMethod("beanValidationMapsFieldErrors"), -1),
                result);

        ResponseEntity<ApiError> response = handler.handleBeanValidation(ex, request);

        assertBody(response, 400, "Bad Request", "Validation failed");
        assertThat(response.getBody().fieldErrors()).containsExactly(
                new FieldErrorDetail("confirmPassword", "Passwords do not match"),
                new FieldErrorDetail("confirmPassword", "Confirm password is required"));
    }

    @Test
    void fieldValidationExceptionMapsTo400() {
        ResponseEntity<ApiError> response = handler.handleFieldValidation(
                new FieldValidationException("currentPassword", "Current password is incorrect"), request);

        assertBody(response, 400, "Bad Request", "Validation failed");
        assertThat(response.getBody().fieldErrors())
                .containsExactly(new FieldErrorDetail("currentPassword", "Current password is incorrect"));
    }

    @Test
    void malformedInputsMapTo400() {
        List<Exception> malformed = List.of(
                new HttpMessageNotReadableException("bad json", new MockHttpInputMessage(new byte[0])),
                new MethodArgumentTypeMismatchException("abc", Long.class, "id", null, new NumberFormatException()),
                new MalformedRequestException("status"));
        for (Exception ex : malformed) {
            ResponseEntity<ApiError> response = handler.handleMalformed(ex, request);
            assertBody(response, 400, "Bad Request", "Malformed request");
            assertThat(response.getBody().fieldErrors()).isEmpty();
        }
    }

    @Test
    void invalidCredentialsMapsTo401() {
        assertBody(handler.handleInvalidCredentials(new InvalidCredentialsException(), request),
                401, "Unauthorized", "Invalid username or password");
    }

    @Test
    void accountDisabledMapsTo403() {
        assertBody(handler.handleAccountDisabled(new AccountDisabledException(), request),
                403, "Forbidden", "Account is disabled");
    }

    @Test
    void notFoundMapsTo404() {
        assertBody(handler.handleNotFound(new ResourceNotFoundException("Task not found"), request),
                404, "Not Found", "Task not found");
        assertBody(handler.handleNotFound(new ResourceNotFoundException("User not found"), request),
                404, "Not Found", "User not found");
    }

    @Test
    void unknownRouteMapsTo404() {
        assertBody(handler.handleNoResource(new NoResourceFoundException(HttpMethod.GET, "/api/nope"), request),
                404, "Not Found", "Resource not found");
    }

    @Test
    void wrongMethodMapsTo405() {
        assertBody(handler.handleMethodNotAllowed(new HttpRequestMethodNotSupportedException("DELETE"), request),
                405, "Method Not Allowed", "Method not allowed");
    }

    @Test
    void conflictMapsTo409() {
        assertBody(handler.handleConflict(new ConflictException("Username is already taken"), request),
                409, "Conflict", "Username is already taken");
    }

    @Test
    void unexpectedMapsTo500WithoutDetails() {
        ResponseEntity<ApiError> response = handler.handleUnexpected(
                new IllegalStateException("SELECT * FROM users failed"), request);

        assertBody(response, 500, "Internal Server Error", "Unexpected error");
        assertThat(response.getBody().toString()).doesNotContain("SELECT");
    }
}
