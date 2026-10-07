package com.todoapp.admin;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.todoapp.admin.dto.AdminPasswordResetRequest;
import com.todoapp.admin.dto.AdminUserResponse;
import com.todoapp.admin.dto.UserStatusRequest;
import com.todoapp.security.CurrentUserProvider;
import com.todoapp.security.TokenRenewalFilter;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;
    private final CurrentUserProvider currentUserProvider;

    public AdminUserController(AdminUserService adminUserService, CurrentUserProvider currentUserProvider) {
        this.adminUserService = adminUserService;
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping
    public List<AdminUserResponse> list(@RequestParam(required = false) String q) {
        return adminUserService.list(q);
    }

    @GetMapping("/{userId}")
    public AdminUserResponse get(@PathVariable Long userId) {
        return adminUserService.get(userId);
    }

    @PatchMapping("/{userId}/status")
    public AdminUserResponse setStatus(@PathVariable Long userId, @Valid @RequestBody UserStatusRequest request) {
        return adminUserService.setEnabled(currentUserProvider.getCurrentUser().id(), userId, request.enabled());
    }

    @PutMapping("/{userId}/password")
    public AdminUserResponse resetPassword(@PathVariable Long userId,
            @Valid @RequestBody AdminPasswordResetRequest request, HttpServletResponse response) {
        PasswordResetResult result = adminUserService.resetPassword(currentUserProvider.getCurrentUser().id(), userId, request);
        if (result.ownAccount()) {
            // The renewal filter already wrote a token with the old version; replace it with the new one.
            response.setHeader(TokenRenewalFilter.TOKEN_HEADER, result.newToken());
            response.setHeader(TokenRenewalFilter.EXPIRES_IN_HEADER, String.valueOf(result.expiresIn()));
        }
        return result.user();
    }
}
