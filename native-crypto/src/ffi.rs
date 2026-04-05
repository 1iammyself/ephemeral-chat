// FFI exports — implemented in Task 9
pub extern "C" fn ephchat_version() -> *const std::os::raw::c_char {
    b"ephchat-crypto v0.1.0\0".as_ptr() as *const std::os::raw::c_char
}
