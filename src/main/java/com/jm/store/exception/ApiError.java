package com.jm.store.exception;
import lombok.*;
import java.time.Instant;
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class ApiError {
    private int status;
    private String message;
    private Instant timestamp;
}
