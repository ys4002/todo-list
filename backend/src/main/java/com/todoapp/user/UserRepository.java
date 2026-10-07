package com.todoapp.user;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    /** {@code pattern} is a lower-case LIKE pattern escaped with {@code escapeChar}, or null for no filter. */
    @Query("""
            select new com.todoapp.user.UserSummary(u,
                (select count(t) from Task t where t.userId = u.id),
                (select count(t) from Task t where t.userId = u.id and t.completed = false))
            from User u
            where :pattern is null
               or lower(u.username) like :pattern escape :escapeChar
               or lower(u.name) like :pattern escape :escapeChar
            order by u.username asc
            """)
    List<UserSummary> searchSummaries(@Param("pattern") String pattern, @Param("escapeChar") char escapeChar);

    @Query("""
            select new com.todoapp.user.UserSummary(u,
                (select count(t) from Task t where t.userId = u.id),
                (select count(t) from Task t where t.userId = u.id and t.completed = false))
            from User u
            where u.id = :id
            """)
    Optional<UserSummary> findSummaryById(@Param("id") Long id);
}
