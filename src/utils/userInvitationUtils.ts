/**
 * Utility functions for user invitation
 */

import { createUser } from '../api';

/**
 * Generates first and last name from an email address
 * @param email - The email address to generate names from
 * @returns An object with firstName and lastName
 */
export const generateNameFromEmail = (email: string): { firstName: string; lastName: string } => {
  // Generate names from email (before @ symbol)
  const emailPrefix = email.split('@')[0];
  const nameParts = emailPrefix.split(/[._-]/);
  
  // Capitalize first letter of each part
  let firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'User';
  let lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'User';
  
  // Special handling for common email prefixes
  if (emailPrefix.toLowerCase() === 'info') {
    firstName = 'Info';
    lastName = 'User';
  } else if (emailPrefix.toLowerCase() === 'admin') {
    firstName = 'Admin';
    lastName = 'User';
  } else if (emailPrefix.toLowerCase() === 'support') {
    firstName = 'Support';
    lastName = 'User';
  } else if (emailPrefix.toLowerCase() === 'noreply') {
    firstName = 'System';
    lastName = 'User';
  } else if (nameParts.length === 1) {
    // If only one part, use it as first name and "User" as last name
    firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
    lastName = 'User';
  }
  
  return { firstName, lastName };
};

/**
 * Handles user invitation process
 * @param email - The email address of the user to invite
 * @param handleRefreshData - Function to refresh data after user creation
 * @returns Promise that resolves when invitation is complete
 * @throws Error if invitation fails
 */
export const handleInviteUser = async (
  email: string,
  handleRefreshData: () => Promise<void>
): Promise<void> => {
  try {
    // Check email server status first
    const emailStatusResponse = await fetch('/api/admin/email-status', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });
    
    if (emailStatusResponse.ok) {
      const emailStatus = await emailStatusResponse.json();
      if (!emailStatus.available) {
        throw new Error(`Email server is not available: ${emailStatus.error}. Please configure email settings in the admin panel before inviting users.`);
      }
    } else {
      console.warn('Could not check email status, proceeding with invitation');
    }

    // Generate names from email
    const { firstName, lastName } = generateNameFromEmail(email);
    
    // Generate a temporary password (user will change it during activation)
    const tempPassword = crypto.randomUUID().substring(0, 12);
    
    const result = await createUser({
      email,
      password: tempPassword,
      firstName,
      lastName,
      role: 'user'
    });
    
    // Check if email was actually sent
    if (result.emailSent === false) {
      throw new Error(`User created successfully, but invitation email could not be sent: ${result.emailError || 'Email service unavailable'}. The user will need to be manually activated.`);
    }
    
    // Refresh members list to show the new user
    await handleRefreshData();
  } catch (error: any) {
    console.error('Failed to invite user:', error);
    
    // Extract more specific error message
    let errorMessage = 'Failed to send invitation';
    
    if (error.response?.data?.error) {
      const backendError = error.response.data.error;
      if (backendError.includes('already exists')) {
        errorMessage = `User with email ${email} already exists`;
      } else if (backendError.includes('required')) {
        errorMessage = 'Missing required information. Please try again.';
      } else if (backendError.includes('email')) {
        errorMessage = 'Invalid email address format';
      } else {
        errorMessage = backendError;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

