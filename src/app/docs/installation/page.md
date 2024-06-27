---
title: Installation
nextjs:
  metadata:
    title: Installation
    description: How to install AI::Engine in 5 minutes.
---

[AI::Engine](https://insertrobot.com) is a gem you can use to add AI to your Rails app in minutes, not days - I work full-time on maintaining and improving the gem, and offer various support options to make building your MVP or AI feature as quick, easy and cheap as possible.

This guide contains installation instructions for the gem.

---

## Choose your plan

I offer 2 options for AI::Engine - [monthly ($69.99)](https://insertrobot.lemonsqueezy.com/buy/38b94af2-3aa2-4e85-8b9a-cf550cf57ecf?discount=0) or [annual ($699.99, saving $139.89)](https://insertrobot.lemonsqueezy.com/buy/159e9402-f971-4dcc-870a-ad0f2e19f899). Both come with a 7 day free trial (first 100 purchases only).

### Bonus

The [annual option ($699.99)](https://insertrobot.lemonsqueezy.com/buy/159e9402-f971-4dcc-870a-ad0f2e19f899) includes 2 full days of my time in which I will build your MVP/AI feature for you using AI::Engine, worth $2400 - first 30 purchases only!

## Add token to ENV

After you sign up you will receive an AI_ENGINE_TOKEN, which you need to install the gem. This needs to be added to your system ENV (as well as any servers your app runs on). You can't just include it with dotenv as it needs to be available in the Gemfile.

There is a guide to doing this on different platforms [here](https://chlee.co/how-to-setup-environment-variables-for-windows-mac-and-linux/).

## Add to Gemfile

Install the latest version of AI::Engine, passing your token in via ENV:

```
source "https://#{ENV["AI_ENGINE_TOKEN"]}@get.keygen.sh/97ac1497-64bd-4754-8336-d709b6df18b1/0.3.0" do
  gem "ai-engine", "~> 0.3.0"
end
```

Run `bundle install` to fetch and install the gem!

## Config

AI::Engine needs your OpenAI Access Token and Organization ID, so add this file:

```
# config/initializers/ai_engine.rb
AI::Engine.setup do |config|
  config.openai_access_token = ENV.fetch("OPENAI_ACCESS_TOKEN"nil)
  config.openai_organization_id = ENV.fetch("OPENAI_ORGANIZATION_ID", nil)
end
```

### Optional: Dotenv + Test

For dotenv to work in a config file you might need to include it as below. Also, for testing with VCR, adding a dummy-token can be useful to avoid TOKEN NOT FOUND errors.

```
# config/initializers/ai_engine.rb
require "dotenv/load"
Dotenv.load("../../.env")

AI::Engine.setup do |config|
  config.openai_access_token = ENV.fetch("OPENAI_ACCESS_TOKEN", Rails.env.test? ? "dummy-token" : nil)
  config.openai_organization_id = ENV.fetch("OPENAI_ORGANIZATION_ID", nil)
end
```

## Generate Migrations

AI::Engine comes with namespaced tables, used to store Chats, Messages, Assistants, Threads and Runs in your database, for easy management of the OpenAI&#174; API. Once the gem is installed, run:

```
bundle exec rails ai_engine:install:migrations

```

Run the migrations to add the tables:

```
bundle exec rails db:migrate
```

The new tables should then be available in your database and visible in your `db/schema.rb` or `db/structure.sql`.

## Support

Any issues, please email me at [hello@alexrudall.com](hello@alexrudall.com) and I'll respond ASAP.

## Done

You're now ready to start using AI::Engine! Let's start with [simple chat streaming](/docs/chattable).
