const validator = require('validator');

/**
 * Sanitize strings to prevent XSS attacks
 */
function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    return validator.escape(str.trim());
}

/**
 * Validate Player Nickname
 */
function validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
        return { valid: false, message: 'กรุณากรอกชื่อเล่น' };
    }
    const clean = nickname.trim();
    if (clean.length < 2 || clean.length > 20) {
        return { valid: false, message: 'ชื่อเล่นต้องมีความยาวระหว่าง 2 ถึง 20 ตัวอักษร' };
    }
    return { valid: true, value: sanitizeInput(clean) };
}

/**
 * Validate Selected Option (3 choices: a, b, c)
 */
function validateOption(option) {
    if (!option || typeof option !== 'string') {
        return { valid: false, message: 'ตัวเลือกไม่ถูกต้อง' };
    }
    const clean = option.toLowerCase().trim();
    if (!['a', 'b', 'c'].includes(clean)) {
        return { valid: false, message: 'ตัวเลือกต้องเป็น a, b หรือ c เท่านั้น' };
    }
    return { valid: true, value: clean };
}

/**
 * Validate Quiz Title
 */
function validateQuizTitle(title) {
    if (!title || typeof title !== 'string') {
        return { valid: false, message: 'กรุณากรอกชื่อหัวข้อ' };
    }
    const clean = title.trim();
    if (clean.length < 3 || clean.length > 100) {
        return { valid: false, message: 'ชื่อหัวข้อต้องมีความยาวระหว่าง 3 ถึง 100 ตัวอักษร' };
    }
    return { valid: true, value: sanitizeInput(clean) };
}

/**
 * Validate Host Password
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: 'กรุณากรอกรหัสผ่าน Host' };
    }
    if (password.length < 4) {
        return { valid: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร' };
    }
    return { valid: true, value: password };
}

/**
 * Validate Game PIN format (6 digits)
 */
function validateGamePin(pin) {
    if (!pin || typeof pin !== 'string') {
        return { valid: false, message: 'PIN ไม่ถูกต้อง' };
    }
    const clean = pin.trim();
    if (!/^\d{6}$/.test(clean)) {
        return { valid: false, message: 'Game PIN ต้องเป็นตัวเลข 6 หลัก' };
    }
    return { valid: true, value: clean };
}

module.exports = {
    sanitizeInput,
    validateNickname,
    validateOption,
    validateQuizTitle,
    validatePassword,
    validateGamePin
};
