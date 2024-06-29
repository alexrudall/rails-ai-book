---
title: Assistable
nextjs:
  metadata:
    title: Assistable
    description: Add OpenAI Assistants to your Rails app.
---

[Work in progress!]

This guide will walk you through adding streaming AI Assistants to your Rails app using [AI::Engine](https://insertrobot.com).

The guide includes the backend integration with AI::Engine, controllers and views to create Assistants, Threads, Runs and Messages, and various helpers to allow streaming of responses. It includes an abstraction called Storyteller, which is a model in your app that owns an assistant - it could be anything, eg. BusinessStrategy, RecipeMaker, etc.

![assistable-ui](/images/ai-engine/assistable/assistable-ui.png)

---

## Installation

First, install AI::Engine - [guide here](/docs/installation).

---

## Data Model

OpenAI Assistants consist of 4 concepts: Assistants, Threads, Runs and Messages. Assistants store the AI model, and any supporting files and data. Threads represent a set of Messages. Messages can be added by the user to Threads, and then at any point a Run can be created, which needs an Assistant and a Thread. The Run will then pass all the Messages in the given Thread to the Assistant, which will then take a summary of all the messages so far, and generate a response, which can be streamed from the Run.

To mirror this in your Rails app, AI::Engine includes a `Assistable` module, the `AI::Engine::Assistant`, `AI::Engine::AssistantThread`, `AI::Engine::Run` and `AI::Engine::Message` classes and migrations to add these to your database. They're called `AI::Engine::AssistantThreads` rather than `AI::Engine::Threads` because `Thread` is an important protected word in Ruby.

The relations between these models and the methods added can be viewed in [this diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page). Red indicates code that will be added to your app via `include Assistable` and `include Threadable`, and blue code that is in the AI::Engine gem. Yellow text indicates relations between models in your app and models in AI::Engine.

## Integration

### Include Assistable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/storyteller.rb)

Add the Assistable module to the model that an Assistant will `belong_to` - in this example the `Storyteller` model, in your app it could be anything, eg. a BusinessStrategy or a SpaghettiRecipeMaker.

```ruby
class Storyteller < ApplicationRecord
  include AI::Engine::Assistable
  ...
```

This adds a new `has_one` relation, so you can call `Storyteller#assistant` and get the `AI::Engine::Assistant` belonging to the model. It adds `before_create :create_openai_assistant` and `before_update :update_openai_assistant` callbacks so that when a Storyteller

It also adds a method, `ai_engine_assistant`, which can be overridden in your Assistable model - eg., Storyteller - to define the Assistant. For example, this Storyteller definition takes the Assistant parameters from the Storyteller. The corresponding `AI::Engine::Assistant` and the Assistant on OpenAI's API will then be created and updated to match the Storyteller.

```ruby
  class Storyteller < ApplicationRecord
    include AI::Engine::Assistable

    def ai_engine_assistant
      {
        name: name,
        model: model,
        description: name,
        instructions: instructions
      }
    end
  end
```

### Include Threadable

We also need a way to create and manage Threads and receive messages from OpenAI.

## User Interface

Now we need a way to create the storytellers and threads stream the response messages from the user.

### Storyteller CRUD

We can now add a simple Storyteller resource. Each Storyteller will get a corresponding `AI::Engine::Assistant` created in the database, and a corresponding `Assistant` on the OpenAI API.

### Gemfile

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/Gemfile)

We're using these gems:

```ruby
# Gemfile
# Hotwire's SPA-like page accelerator
# https://turbo.hotwired.dev
gem "turbo-rails"

# Hotwire's modest JavaScript framework
# https://stimulus.hotwired.dev
gem "stimulus-rails"

# Use Tailwind CSS
# https://github.com/rails/tailwindcss-rails
gem "tailwindcss-rails"

# The safe Markdown parser.
# https://github.com/vmg/redcarpet
gem "redcarpet", "~> 3.6"
```

### Routes

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/config/routes.rb)

Add the routes:

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resources :storytellers
  ...
```

### StorytellersController

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/controllers/storytellers_controller.rb)

We set `@selected_model` so that different models can be chosen per response, and the model used in the previous message will be the default for the select:

```ruby

```
