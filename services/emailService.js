/**
 * Email Service Module
 * Supports SendGrid, Mailgun, and SMTP
 * Handles all email sending with templating and logging
 */

const fs = require('fs').promises;
const path = require('path');
const { query } = require('../db/connection');

/**
 * Email Service Configuration
 */
const emailConfig = {
    service: process.env.EMAIL_SERVICE || 'smtp', // 'sendgrid', 'mailgun', 'smtp'
    from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Premium Hair Wigs & Extensions',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    adminUrl: process.env.ADMIN_URL || 'http://localhost:3001',
    
    // SendGrid
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    
    // Mailgun
    mailgunApiKey: process.env.MAILGUN_API_KEY,
    mailgunDomain: process.env.MAILGUN_DOMAIN,
    
    // SMTP
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT) || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpSecure: process.env.SMTP_SECURE === 'true'
};

/**
 * Log email send attempt
 */
const logEmail = async (recipient, emailType, subject, status, errorMessage = null) => {
    try {
        await query(
            `INSERT INTO email_logs (recipient, email_type, subject, status, error_message)
             VALUES ($1, $2, $3, $4, $5)`,
            [recipient, emailType, subject, status, errorMessage]
        );
    } catch (error) {
        console.error('Failed to log email:', error);
    }
};

/**
 * Load and populate email template
 */
const loadTemplate = async (templateName, variables) => {
    try {
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
        let template = await fs.readFile(templatePath, 'utf-8');
        
        // Replace all variables in the template
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            template = template.replace(regex, variables[key]);
        });
        
        return template;
    } catch (error) {
        console.error(`Failed to load template ${templateName}:`, error);
        throw new Error(`Template ${templateName} not found`);
    }
};

/**
 * Generate plain text version from HTML
 */
const htmlToPlainText = (html) => {
    return html
        .replace(/<style[^>]*>.*?<\/style>/gi, '')
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Send email using configured service
 */
const sendEmail = async (to, subject, htmlContent, textContent = null) => {
    const emailType = 'generic';
    
    try {
        // Generate plain text if not provided
        if (!textContent) {
            textContent = htmlToPlainText(htmlContent);
        }
        
        // In development mode, just log the email
        if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_SERVICE) {
            console.log('\n====== EMAIL (Development Mode) ======');
            console.log('To:', to);
            console.log('Subject:', subject);
            console.log('HTML Content:', htmlContent.substring(0, 200) + '...');
            console.log('======================================\n');
            
            await logEmail(to, emailType, subject, 'sent');
            return { success: true, message: 'Email logged in development mode' };
        }
        
        // Send based on configured service
        let result;
        switch (emailConfig.service) {
            case 'sendgrid':
                result = await sendViaSendGrid(to, subject, htmlContent, textContent);
                break;
            case 'mailgun':
                result = await sendViaMailgun(to, subject, htmlContent, textContent);
                break;
            case 'smtp':
                result = await sendViaSMTP(to, subject, htmlContent, textContent);
                break;
            default:
                throw new Error(`Unsupported email service: ${emailConfig.service}`);
        }
        
        await logEmail(to, emailType, subject, 'sent');
        return result;
        
    } catch (error) {
        console.error('Email send error:', error);
        await logEmail(to, emailType, subject, 'failed', error.message);
        throw error;
    }
};

/**
 * Send via SendGrid (requires @sendgrid/mail package)
 */
const sendViaSendGrid = async (to, subject, htmlContent, textContent) => {
    try {
        // Check if SendGrid package is available
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(emailConfig.sendgridApiKey);
        
        const msg = {
            to,
            from: {
                email: emailConfig.from,
                name: emailConfig.fromName
            },
            subject,
            text: textContent,
            html: htmlContent
        };
        
        await sgMail.send(msg);
        return { success: true, message: 'Email sent via SendGrid' };
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.warn('SendGrid package not installed. Install with: npm install @sendgrid/mail');
            throw new Error('SendGrid package not installed');
        }
        throw error;
    }
};

/**
 * Send via Mailgun (requires mailgun.js package)
 */
const sendViaMailgun = async (to, subject, htmlContent, textContent) => {
    try {
        // Check if Mailgun package is available
        const formData = require('form-data');
        const Mailgun = require('mailgun.js');
        const mailgun = new Mailgun(formData);
        
        const mg = mailgun.client({
            username: 'api',
            key: emailConfig.mailgunApiKey
        });
        
        const messageData = {
            from: `${emailConfig.fromName} <${emailConfig.from}>`,
            to,
            subject,
            text: textContent,
            html: htmlContent
        };
        
        await mg.messages.create(emailConfig.mailgunDomain, messageData);
        return { success: true, message: 'Email sent via Mailgun' };
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.warn('Mailgun package not installed. Install with: npm install mailgun.js form-data');
            throw new Error('Mailgun package not installed');
        }
        throw error;
    }
};

/**
 * Send via SMTP (requires nodemailer package)
 */
const sendViaSMTP = async (to, subject, htmlContent, textContent) => {
    try {
        // Check if nodemailer is available
        const nodemailer = require('nodemailer');
        
        const transporter = nodemailer.createTransport({
            host: emailConfig.smtpHost,
            port: emailConfig.smtpPort,
            secure: emailConfig.smtpSecure,
            auth: {
                user: emailConfig.smtpUser,
                pass: emailConfig.smtpPass
            }
        });
        
        const mailOptions = {
            from: `"${emailConfig.fromName}" <${emailConfig.from}>`,
            to,
            subject,
            text: textContent,
            html: htmlContent
        };
        
        await transporter.sendMail(mailOptions);
        return { success: true, message: 'Email sent via SMTP' };
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.warn('Nodemailer package not installed. Install with: npm install nodemailer');
            throw new Error('Nodemailer package not installed');
        }
        throw error;
    }
};

/**
 * Send order confirmation email
 */
const sendOrderConfirmation = async (order, customer) => {
    try {
        const htmlContent = await loadTemplate('order-confirmation', {
            customerName: customer.name,
            orderNumber: order.order_number,
            orderDate: new Date(order.created_at).toLocaleDateString(),
            totalAmount: `R ${parseFloat(order.total_amount).toFixed(2)}`,
            orderDetailsUrl: `${emailConfig.frontendUrl}/orders/${order.id}`,
            supportEmail: process.env.SUPPORT_EMAIL || 'support@premiumhairsa.co.za'
        });
        
        await sendEmail(
            customer.email,
            `Order Confirmation - ${order.order_number}`,
            htmlContent
        );
        
        await logEmail(customer.email, 'order_confirmation', `Order ${order.order_number}`, 'sent');
    } catch (error) {
        console.error('Failed to send order confirmation:', error);
        throw error;
    }
};

/**
 * Send password reset email
 */
const sendPasswordReset = async (email, resetToken, userName) => {
    try {
        const resetUrl = `${emailConfig.frontendUrl}/reset-password?token=${resetToken}`;
        
        const htmlContent = await loadTemplate('password-reset', {
            userName: userName || 'Customer',
            resetUrl,
            expiryTime: '1 hour',
            supportEmail: process.env.SUPPORT_EMAIL || 'support@premiumhairsa.co.za'
        });
        
        await sendEmail(
            email,
            'Password Reset Request',
            htmlContent
        );
        
        await logEmail(email, 'password_reset', 'Password Reset', 'sent');
    } catch (error) {
        console.error('Failed to send password reset email:', error);
        throw error;
    }
};

/**
 * Send email verification email
 */
const sendEmailVerification = async (email, verificationToken, userName) => {
    try {
        const verificationUrl = `${emailConfig.frontendUrl}/verify-email?token=${verificationToken}`;
        
        const htmlContent = await loadTemplate('email-verification', {
            userName: userName || 'Customer',
            verificationUrl,
            supportEmail: process.env.SUPPORT_EMAIL || 'support@premiumhairsa.co.za'
        });
        
        await sendEmail(
            email,
            'Verify Your Email Address',
            htmlContent
        );
        
        await logEmail(email, 'email_verification', 'Email Verification', 'sent');
    } catch (error) {
        console.error('Failed to send verification email:', error);
        throw error;
    }
};

/**
 * Send low stock alert to admins
 */
const sendLowStockAlert = async (products, adminEmails) => {
    try {
        let productList = '';
        products.forEach(product => {
            productList += `
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">${product.name}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${product.sku}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${product.stock_quantity}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${product.low_stock_threshold}</td>
                </tr>
            `;
        });
        
        const htmlContent = await loadTemplate('low-stock-alert', {
            productCount: products.length,
            productList,
            adminUrl: emailConfig.adminUrl,
            date: new Date().toLocaleDateString()
        });
        
        for (const adminEmail of adminEmails) {
            await sendEmail(
                adminEmail,
                `Low Stock Alert - ${products.length} Products`,
                htmlContent
            );
            
            await logEmail(adminEmail, 'low_stock_alert', 'Low Stock Alert', 'sent');
        }
    } catch (error) {
        console.error('Failed to send low stock alert:', error);
        throw error;
    }
};

/**
 * Send return/refund notification
 */
const sendReturnNotification = async (returnData, customer) => {
    try {
        const htmlContent = `
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Return Request Received</h2>
                <p>Dear ${customer.name},</p>
                <p>We have received your return request for Order #${returnData.order_number}.</p>
                <p><strong>Return Status:</strong> ${returnData.status}</p>
                <p>We will process your request within 2-3 business days.</p>
                <p>If you have any questions, please contact us at ${process.env.SUPPORT_EMAIL || 'support@premiumhairsa.co.za'}</p>
                <p>Best regards,<br>${emailConfig.fromName}</p>
            </body>
            </html>
        `;
        
        await sendEmail(
            customer.email,
            `Return Request Received - Order ${returnData.order_number}`,
            htmlContent
        );
        
        await logEmail(customer.email, 'return_notification', `Return for Order ${returnData.order_number}`, 'sent');
    } catch (error) {
        console.error('Failed to send return notification:', error);
        throw error;
    }
};

/**
 * Send newsletter verification email
 */
const sendNewsletterVerification = async (email, verificationToken) => {
    try {
        const verificationUrl = `${emailConfig.frontendUrl}/newsletter/verify/${verificationToken}`;
        
        const htmlContent = `
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Confirm Your Newsletter Subscription</h2>
                <p>Thank you for subscribing to our newsletter!</p>
                <p>Please click the button below to confirm your subscription:</p>
                <div style="margin: 30px 0;">
                    <a href="${verificationUrl}" 
                       style="background-color: #4CAF50; color: white; padding: 15px 30px; 
                              text-decoration: none; border-radius: 5px; display: inline-block;">
                        Confirm Subscription
                    </a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="color: #666;">${verificationUrl}</p>
                <p>If you didn't request this subscription, please ignore this email.</p>
                <p>Best regards,<br>${emailConfig.fromName}</p>
            </body>
            </html>
        `;
        
        await sendEmail(
            email,
            'Confirm Newsletter Subscription',
            htmlContent
        );
        
        await logEmail(email, 'newsletter_verification', 'Newsletter Verification', 'sent');
    } catch (error) {
        console.error('Failed to send newsletter verification:', error);
        throw error;
    }
};

module.exports = {
    sendEmail,
    sendOrderConfirmation,
    sendPasswordReset,
    sendEmailVerification,
    sendLowStockAlert,
    sendReturnNotification,
    sendNewsletterVerification
};
