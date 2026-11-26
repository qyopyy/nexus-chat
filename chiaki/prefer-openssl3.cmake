# Injected with CMAKE_PROJECT_INCLUDE by scripts/build-chiaki.sh.
# Homebrew may link OpenSSL 4 into $(brew --prefix)/include, which other dependencies add
# as an include path; chiaki-ng needs OpenSSL 3, so its headers must come first everywhere.
# The OpenSSL 3 dir is exposed through a separate real directory: CMake and clang both drop
# a -I that duplicates a system include dir, which would leave OpenSSL 4 winning.
set(_openssl3_alias "${CMAKE_BINARY_DIR}/openssl3-include")
file(REMOVE "${_openssl3_alias}")
file(MAKE_DIRECTORY "${_openssl3_alias}")
file(CREATE_LINK "${OPENSSL_INCLUDE_DIR}/openssl" "${_openssl3_alias}/openssl" SYMBOLIC)
include_directories(BEFORE "${_openssl3_alias}")
