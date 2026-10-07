package com.todoapp.common;

/** A request value that cannot be parsed (for example an unknown status filter); mapped to 400 "Malformed request". */
public class MalformedRequestException extends RuntimeException {

    public MalformedRequestException(String message) {
        super(message);
    }
}
