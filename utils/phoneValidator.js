// utils/phoneValidator.js
const Logger = require('./logger');

class PhoneValidator {
  /**
   * Normalize phone number to Indonesian format (62xxx)
   * Input: "081995770190", "81995770190", "+6281995770190"
   * Output: "6281995770190"
   */
  static normalize(phone) {
    if (!phone) return null;

    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Remove leading +
    cleaned = cleaned.replace(/^\+/, '');

    // Convert 0xxx to 62xxx
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }

    // Add 62 if not present
    if (!cleaned.startsWith('62')) {
      cleaned = '62' + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate Indonesian phone number
   */
  static validate(phone) {
    const normalized = this.normalize(phone);
    
    if (!normalized) {
      return {
        valid: false,
        message: 'Nomor WhatsApp tidak boleh kosong'
      };
    }

    // Indonesian phone validation:
    // - Must start with 62
    // - Total length: 11-15 digits (62 + 9-13 digits)
    // - Second digit after 62 must be 8 (mobile)
    const regex = /^628\d{8,11}$/;

    if (!regex.test(normalized)) {
      return {
        valid: false,
        message: 'Format nomor WhatsApp tidak valid. Contoh: 081234567890'
      };
    }

    return {
      valid: true,
      normalized: normalized
    };
  }

  /**
   * Format for display (08xxx-xxxx-xxxx)
   */
  static formatDisplay(phone) {
    const normalized = this.normalize(phone);
    if (!normalized) return phone;

    // Convert 62xxx to 0xxx for display
    if (normalized.startsWith('62')) {
      const local = '0' + normalized.slice(2);
      
      // Format: 0819-9577-0190
      if (local.length >= 11) {
        return local.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
      }
      
      return local;
    }

    return normalized;
  }

  /**
   * Get WhatsApp chat ID format
   */
  static toChatId(phone) {
    const normalized = this.normalize(phone);
    if (!normalized) return null;
    return `${normalized}@c.us`;
  }
}

module.exports = PhoneValidator;