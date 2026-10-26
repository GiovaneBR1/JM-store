package com.jm.store.exception;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiError handleGlobal(Exception e, HttpServletRequest req) {
        return ApiError.builder().status(500).message(e.getMessage()).timestamp(Instant.now()).build();
    }
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ApiError handleForbidden(Exception e, HttpServletRequest req) {
        return ApiError.builder().status(403).message("Access denied").timestamp(Instant.now()).build();
    }
}
