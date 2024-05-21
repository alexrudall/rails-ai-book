---
title: Streaming Chat
nextjs:
  metadata:
    title: Streaming Chat
    description: Add a messaging stream.
---

This guide will walk you through adding a ChatGPT-like messaging stream to your Ruby on Rails 7 app using ruby-openai, Rails 7, Hotwire, Turbostream, Sidekiq and Tailwind. It's based on [this gist](https://gist.github.com/alexrudall/cb5ee1e109353ef358adb4e66631799d).

---

## The Code

### Gemfile

First, add the ruby-openai gem! It needs to be at least version 4. Add Sidekiq too if you don't have it.

```ruby
# Gemfile
# https://github.com/alexrudall/ruby-openai
gem "ruby-openai", "~> 7.0.1"

# Simple, efficient background processing using Redis.
# https://github.com/sidekiq/sidekiq
gem "sidekiq", "~> 7.2.4"
```

Install Redis on your machine

### Domain Modelling

### Controllers

### The AI Job

### Views
