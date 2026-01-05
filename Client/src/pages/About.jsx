import React from 'react';
import { Link } from 'react-router-dom';
import './About.css';

const About = () => {
    return (
        <div className="about-page">
            <div className="about-hero">
                <h1>Distributed Task Scheduler</h1>
                <p className="subtitle">A Real-Time Visualizer for Distributed Systems</p>
            </div>

            <section className="about-section">
                <h2>🎯 What is this?</h2>
                <p>
                    This is an <strong>interactive educational tool</strong> designed to demonstrate
                    how distributed systems work. It's not a production scheduler—it's a visualizer
                    that lets you see leader election, fault tolerance, and task execution in real-time.
                </p>
            </section>

            <section className="about-section">
                <h2>✨ Key Features</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <span className="feature-icon">👑</span>
                        <h3>Leader Election</h3>
                        <p>Watch Etcd-based consensus in action with automatic failover</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🔒</span>
                        <h3>Lease-Based Execution</h3>
                        <p>See how database leases prevent duplicate task processing</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">💥</span>
                        <h3>Chaos Engineering</h3>
                        <p>Kill leaders and workers to test system resilience</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">📊</span>
                        <h3>Real-Time Topology</h3>
                        <p>Interactive visualization of schedulers, workers, and task flow</p>
                    </div>
                </div>
            </section>

            <section className="about-section">
                <h2>🛠️ Tech Stack</h2>
                <div className="tech-stack">
                    <span className="tech-badge">React</span>
                    <span className="tech-badge">Node.js</span>
                    <span className="tech-badge">PostgreSQL</span>
                    <span className="tech-badge">Redis Streams</span>
                    <span className="tech-badge">Etcd</span>
                    <span className="tech-badge">Socket.IO</span>
                </div>
            </section>

            <section className="about-section about-author">
                <h2>👨‍💻 About the Author</h2>
                <div className="author-card">
                    <div className="author-avatar">
                        <img
                            src="http://avatars.githubusercontent.com/u/78208876?v=4"
                            alt="Profile"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'https://via.placeholder.com/120?text=DK';
                            }}
                        />
                    </div>
                    <div className="author-info">
                        <h3>Dikshant</h3>
                        <p className="author-title">Software Engineer</p>
                        <p className="author-bio">
                            Passionate about distributed systems, backend engineering, and building
                            tools that help others learn complex concepts through visualization.
                        </p>
                        <div className="author-links">
                            <a
                                href="https://github.com/Dikshant09"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="social-link github"
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                GitHub
                            </a>
                            <a
                                href="https://linkedin.com/in/your-linkedin"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="social-link linkedin"
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                </svg>
                                LinkedIn
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* <section className="about-section">
                <h2>🚀 Try It Out</h2>
                <div className="cta-buttons">
                    <Link to="/" className="cta-button primary">
                        Go to Dashboard
                    </Link>
                    {/* <a
                        href="https://github.com/Dikshant09/distributed-task-scheduler"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cta-button secondary"
                    >
                        View Source Code
                    </a>
                </div>
            </section> */}
        </div>
    );
};

export default About;
