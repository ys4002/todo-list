package com.todoapp.admin;

import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.todoapp.admin.dto.AdminPasswordResetRequest;
import com.todoapp.admin.dto.AdminUserResponse;
import com.todoapp.auth.PasswordPolicy;
import com.todoapp.common.ConflictException;
import com.todoapp.common.ResourceNotFoundException;
import com.todoapp.common.SearchQueryUtils;
import com.todoapp.security.JwtTokenService;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@Service
public class AdminUserService {

    static final String USER_NOT_FOUND = "User not found";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final JwtTokenService jwtTokenService;

    public AdminUserService(UserRepository userRepository, PasswordEncoder passwordEncoder,
            PasswordPolicy passwordPolicy, JwtTokenService jwtTokenService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.jwtTokenService = jwtTokenService;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> list(String query) {
        return userRepository.searchSummaries(SearchQueryUtils.toLikePattern(query), SearchQueryUtils.ESCAPE_CHAR).stream()
                .map(AdminUserResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public AdminUserResponse get(Long userId) {
        return userRepository.findSummaryById(userId).map(AdminUserResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException(USER_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public void requireUser(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new ResourceNotFoundException(USER_NOT_FOUND);
        }
    }

    @Transactional
    public AdminUserResponse setEnabled(Long callerId, Long targetId, boolean enabled) {
        User target = findUser(targetId);
        if (target.getId().equals(callerId)) {
            throw new ConflictException("You cannot disable your own account");
        }
        target.setEnabled(enabled);
        userRepository.saveAndFlush(target);
        return get(targetId);
    }

    @Transactional
    public PasswordResetResult resetPassword(Long callerId, Long targetId, AdminPasswordResetRequest request) {
        User target = findUser(targetId);
        passwordPolicy.checkNotContainsUsername("newPassword", request.newPassword(), target.getUsername());
        target.changePassword(passwordEncoder.encode(request.newPassword()));
        userRepository.saveAndFlush(target);
        AdminUserResponse response = get(targetId);
        if (target.getId().equals(callerId)) {
            return new PasswordResetResult(response, jwtTokenService.generateToken(target),
                    jwtTokenService.getExpiresInSeconds());
        }
        return new PasswordResetResult(response, null, 0);
    }

    private User findUser(Long userId) {
        return userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException(USER_NOT_FOUND));
    }
}
