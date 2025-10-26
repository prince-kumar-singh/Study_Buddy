import { Link } from 'react-router-dom'
import { 
  Brain, 
  Target, 
  Video, 
  FileText, 
  MessageSquare, 
  GraduationCap,
  Check,
  ArrowRight,
  Play,
  Sparkles,
  BarChart3
} from 'lucide-react'
import { useState } from 'react'

const Homepage = () => {
  const [activeTestimonial, setActiveTestimonial] = useState(0)

  const features = [
    {
      icon: Video,
      title: 'YouTube to Study Guide',
      description: 'Paste any YouTube lecture URL and get comprehensive study materials in minutes. Works with videos up to 3 hours.',
      color: 'blue'
    },
    {
      icon: FileText,
      title: 'Document Processing',
      description: 'Upload PDFs, DOCX, or TXT files. Our AI extracts key concepts and creates interactive learning materials.',
      color: 'green'
    },
    {
      icon: Brain,
      title: 'Smart Flashcards',
      description: 'AI-generated flashcards with spaced repetition. Learn smarter, not harder, with scientifically-proven techniques.',
      color: 'purple'
    },
    {
      icon: MessageSquare,
      title: 'AI Tutor Q&A',
      description: 'Ask questions about your materials. Get instant, context-aware answers linked to exact video timestamps.',
      color: 'orange'
    },
    {
      icon: Target,
      title: 'Adaptive Quizzes',
      description: 'Auto-generated quizzes that adapt to your performance. Master concepts with personalized assessments.',
      color: 'pink'
    },
    {
      icon: BarChart3,
      title: 'Progress Tracking',
      description: 'Monitor your learning journey with detailed analytics, mastery metrics, and performance insights.',
      color: 'indigo'
    }
  ]

  const stats = [
    { value: '80%', label: 'Time Saved', sublabel: 'vs manual note-taking' },
    { value: '30%', label: 'Better Retention', sublabel: 'through spaced repetition' },
    { value: '3 min', label: 'Setup Time', sublabel: 'to full study guide' },
    { value: '99%', label: 'Accuracy', sublabel: 'in transcription' }
  ]

  const testimonials = [
    {
      name: 'Sara Chen',
      role: 'Computer Science Student',
      avatar: '👩‍💻',
      quote: 'Study Buddy transformed how I learn. What used to take 3 hours of note-taking now takes 30 minutes. My exam scores improved by 15%!',
      rating: 5
    },
    {
      name: 'Marco Rodriguez',
      role: 'Language Learner',
      avatar: '👨‍🎓',
      quote: 'Learning Spanish with YouTube was chaotic until I found Study Buddy. The timestamped flashcards and quizzes made everything click.',
      rating: 5
    },
    {
      name: 'Dr. Priya Patel',
      role: 'Medical Student',
      avatar: '👩‍⚕️',
      quote: 'The AI Q&A feature is like having a personal tutor 24/7. It links answers directly to lecture timestamps. Game-changer for med school.',
      rating: 5
    }
  ]

  const howItWorks = [
    {
      step: 1,
      title: 'Upload Your Content',
      description: 'Paste a YouTube URL or upload documents (PDF, DOCX, TXT). We support lectures up to 3 hours.',
      icon: '📤'
    },
    {
      step: 2,
      title: 'AI Processes Everything',
      description: 'Our AI transcribes, analyzes, and extracts key concepts in 2-5 minutes. Sit back and relax.',
      icon: '🤖'
    },
    {
      step: 3,
      title: 'Get Your Study Guide',
      description: 'Receive summaries, flashcards, quizzes, and interactive Q&A. All synced with video timestamps.',
      icon: '✨'
    },
    {
      step: 4,
      title: 'Learn & Master',
      description: 'Study with spaced repetition flashcards, take adaptive quizzes, and track your progress.',
      icon: '🎯'
    }
  ]

  const pricing = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'Perfect for getting started',
      features: [
        'Up to 5 contents per month',
        'Basic summaries & flashcards',
        '10 AI Q&A questions per week',
        'Standard processing speed',
        'Progress tracking',
        'Mobile-responsive interface'
      ],
      cta: 'Start Free',
      highlighted: false
    },
    {
      name: 'Premium',
      price: '$7',
      period: '/month',
      description: 'For serious learners',
      features: [
        'Unlimited content uploads',
        'Multi-level summaries',
        'Unlimited AI Q&A',
        'Priority processing (2x faster)',
        'Advanced analytics',
        'Export to PDF/DOCX',
        'Priority support',
        'Early access to new features'
      ],
      cta: 'Start Free Trial',
      highlighted: true
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm bg-white/90">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-8 h-8 text-blue-600" />
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Study Buddy
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-700 hover:text-blue-600 transition">Features</a>
              <a href="#how-it-works" className="text-gray-700 hover:text-blue-600 transition">How It Works</a>
              <a href="#pricing" className="text-gray-700 hover:text-blue-600 transition">Pricing</a>
              <a href="#testimonials" className="text-gray-700 hover:text-blue-600 transition">Testimonials</a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-gray-700 hover:text-blue-600 transition font-medium"
              >
                Log In
              </Link>
              <Link
                to="/register"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium shadow-lg shadow-blue-600/30"
              >
                Sign Up Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              AI-Powered Learning Platform
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Transform Any Lecture Into
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> Study Mastery</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Turn YouTube videos and documents into interactive study guides with AI-generated summaries, flashcards, and quizzes. Reduce study time by 80% while improving retention by 30%.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link
                to="/register"
                className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition font-semibold text-lg shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 group"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
              </Link>
              <button className="bg-white text-gray-700 px-8 py-4 rounded-lg hover:bg-gray-50 transition font-semibold text-lg border-2 border-gray-200 flex items-center justify-center gap-2">
                <Play className="w-5 h-5" />
                Watch Demo
              </button>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                <span>5 free contents/month</span>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl p-8 transform hover:scale-105 transition duration-300">
              <div className="bg-white rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Video className="w-6 h-6 text-blue-600" />
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 bg-gray-100 rounded w-full"></div>
                  <div className="h-2 bg-gray-100 rounded w-5/6"></div>
                  <div className="h-2 bg-gray-100 rounded w-4/6"></div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <Brain className="w-5 h-5 text-blue-600 mb-2" />
                    <div className="h-2 bg-blue-200 rounded w-3/4"></div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <Target className="w-5 h-5 text-green-600 mb-2" />
                    <div className="h-2 bg-green-200 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -right-6 bg-orange-500 text-white px-6 py-3 rounded-full shadow-lg font-bold text-lg">
              ⚡ 2-5 min setup
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center">
                <div className="text-4xl lg:text-5xl font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-lg font-semibold text-blue-100 mb-1">
                  {stat.label}
                </div>
                <div className="text-sm text-blue-200">
                  {stat.sublabel}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Everything You Need to
            <span className="text-blue-600"> Learn Faster</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            From transcription to mastery, Study Buddy automates your entire learning workflow with cutting-edge AI.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition border border-gray-100 group hover:border-blue-200"
            >
              <div className={`w-14 h-14 bg-${feature.color}-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition`}>
                <feature.icon className={`w-7 h-7 text-${feature.color}-600`} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              From Upload to
              <span className="text-blue-600"> Mastery</span> in 4 Simple Steps
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              No complicated setup. No manual work. Just paste, wait, and learn.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {howItWorks.map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition h-full">
                  <div className="text-5xl mb-4">{step.icon}</div>
                  <div className="absolute -top-4 -left-4 bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                    {step.step}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-600">
                    {step.description}
                  </p>
                </div>
                {idx < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ArrowRight className="w-8 h-8 text-blue-300" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition font-semibold text-lg shadow-xl shadow-blue-600/30"
            >
              Start Learning Smarter Today
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Loved by
            <span className="text-blue-600"> Students Worldwide</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Join thousands of students who've transformed their learning with Study Buddy.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-white p-8 lg:p-12 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="text-6xl">{testimonials[activeTestimonial].avatar}</div>
              <div>
                <h4 className="text-xl font-bold text-gray-900">
                  {testimonials[activeTestimonial].name}
                </h4>
                <p className="text-gray-600">{testimonials[activeTestimonial].role}</p>
                <div className="flex gap-1 mt-2">
                  {[...Array(testimonials[activeTestimonial].rating)].map((_, i) => (
                    <span key={i} className="text-yellow-400 text-xl">★</span>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xl text-gray-700 leading-relaxed italic">
              "{testimonials[activeTestimonial].quote}"
            </p>
          </div>

          <div className="flex justify-center gap-3 mt-8">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTestimonial(idx)}
                className={`w-3 h-3 rounded-full transition ${
                  idx === activeTestimonial ? 'bg-blue-600 w-8' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Simple, Transparent
              <span className="text-blue-600"> Pricing</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start free and upgrade when you're ready. No hidden fees. Cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {pricing.map((plan, idx) => (
              <div
                key={idx}
                className={`bg-white p-8 rounded-2xl ${
                  plan.highlighted
                    ? 'border-4 border-blue-600 shadow-2xl transform scale-105'
                    : 'border border-gray-200 shadow-lg'
                }`}
              >
                {plan.highlighted && (
                  <div className="bg-blue-600 text-white text-sm font-bold px-4 py-1 rounded-full inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-600 mb-6">{plan.description}</p>
                <div className="flex items-baseline mb-6">
                  <span className="text-5xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-600 ml-2">{plan.period}</span>
                </div>
                <Link
                  to="/register"
                  className={`block w-full text-center py-3 rounded-lg font-semibold transition mb-8 ${
                    plan.highlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </Link>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Learn 80% Faster?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of students who've already transformed their learning. Start free today—no credit card required.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-lg hover:bg-gray-100 transition font-semibold text-lg shadow-xl"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-blue-100 mt-6">
            ✨ 5 free contents per month • No credit card required • Start in 2 minutes
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-6 h-6 text-blue-500" />
                <span className="text-xl font-bold text-white">Study Buddy</span>
              </div>
              <p className="text-sm">
                AI-powered learning platform that transforms YouTube lectures into interactive study guides.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">How It Works</a></li>
                <li><Link to="/register" className="hover:text-white transition">Sign Up</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition">User Guide</a></li>
                <li><a href="#" className="hover:text-white transition">API Docs</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition">Cookie Policy</a></li>
                <li><a href="#" className="hover:text-white transition">GDPR</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>© 2024 Study Buddy. All rights reserved. Built with ❤️ for students worldwide.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Homepage
