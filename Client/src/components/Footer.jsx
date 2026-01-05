import React from 'react';
import './Footer.css';

const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="app-footer">
            <div className="footer-content">
                <span className="copyright">
                    © {currentYear} Distributed Task Scheduler Visualizer
                </span>
                <span className="footer-divider">•</span>
                <span className="footer-tagline">
                    Built with ❤️ for learning distributed systems
                </span>
            </div>
        </footer>
    );
};

export default Footer;
