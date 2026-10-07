package com.todoapp.task;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, Long> {

    Optional<Task> findByIdAndUserId(Long id, Long userId);

    /**
     * The owner's tasks, optionally filtered by completed flag (null = any) and by a lower-case LIKE pattern
     * escaped with {@code escapeChar} (null = no text filter), ordered by due date then creation time.
     */
    @Query("""
            select t from Task t
            where t.userId = :userId
              and (:completed is null or t.completed = :completed)
              and (:pattern is null
                   or lower(t.title) like :pattern escape :escapeChar
                   or lower(coalesce(t.description, '')) like :pattern escape :escapeChar)
            order by t.dueAt asc, t.createdAt asc, t.id asc
            """)
    List<Task> search(@Param("userId") Long userId,
            @Param("completed") Boolean completed,
            @Param("pattern") String pattern,
            @Param("escapeChar") char escapeChar);
}
