---
title: Assistable
nextjs:
  metadata:
    title: Assistable
    description: Add OpenAI Assistants to your Rails app.
---

This guide will walk you through adding streaming AI Assistants to your Rails app using [AI::Engine](https://insertrobot.com).

The guide includes the backend integration with AI::Engine, controllers and views to create Assistants, Threads, Runs and Messages, and various helpers to allow streaming of responses. It includes an abstraction called Storyteller, which is a model in your app that owns an assistant - Storyteller could instead be called anything you want, any _type of assistant_, eg. BusinessStrategy, RecipeMaker, etc.

![assistable-ui](/images/ai-engine/assistable/assistable-ui.png)

---

## Installation

First, install AI::Engine - [guide here](/docs/installation).

---

## Data Model

[Click here to view Data Model diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page)

OpenAI Assistants consist of 4 concepts: Assistants, Threads, Runs and Messages. Assistants store the AI model, and any supporting files and data. Threads represent a set of Messages. Messages can be added by the user to Threads.

Then, at any point, a Run can be created, which requires 1 Assistant and 1 Thread. The Run will then pass all the Messages in the given Thread to the given Assistant, which will then take a summary of all the messages so far, and generate a response using its model. The response can be streamed.

To mirror this in your Rails app, AI::Engine includes a `Assistable` module, the `AI::Engine::Assistant`, `AI::Engine::AssistantThread`, `AI::Engine::Run` and `AI::Engine::Message` classes and migrations to add these to your database. They're called `AI::Engine::AssistantThreads` rather than `AI::Engine::Threads` because `Thread` is an important protected word in Ruby.

The relations between these models and the methods added can be viewed in [this diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page). Red indicates code that will be added to your app via `include Assistable` and `include Threadable`, and blue code that is in the AI::Engine gem. Yellow text indicates relations between models in your app and models in AI::Engine.

## Integration

### Include Assistable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/storyteller.rb)

Add the Assistable module to the model that an Assistant will `belong_to` - in this example the `Storyteller` model, in your app it could be anything, eg. a BusinessStrategy or a SpaghettiRecipeMaker.

```ruby
# app/models/storyteller.rb
class Storyteller < ApplicationRecord
  include AI::Engine::Assistable
  ...
```

This adds a new `has_one` relation, so you can call `Storyteller#assistant` and get the `AI::Engine::Assistant` belonging to the model. It adds `before_create :create_openai_assistant` and `before_update :update_openai_assistant` callbacks, so the corresponding `AI::Engine::Assistant` and the Assistant on OpenAI's API will be created and updated to match the Storyteller.

It adds a method, `ai_engine_assistant`, which can be overridden in your Assistable model - eg., Storyteller - to define the Assistant. For example, this Storyteller definition takes the Assistant parameters from the Storyteller.

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

It also adds a method, `ai_engine_run`, which takes an `assistant_thread` and `content` as params, creates an `AI::Engine::Message` with the user content and runs an `AI::Engine::Run` to get the AI response from the API. The response will be added to a second `AI::Engine::Message` which can be streamed to the UI.

### Include Threadable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/user.rb)

We also need a way to create and manage Threads and receive messages from OpenAI.

Add the Threadable module to the model that Threads will `belong_to` - probably a `User` or `Team` model.

```ruby
# app/models/user.rb
class User < ApplicationRecord
  include AI::Engine::Threadable
  ...
```

This adds a new `has_many` relation, so you can call `User#assistant_threads` and get the `AI::Engine::AssistantThreads` belonging to the model.

It also adds 2 new callback methods, `ai_engine_on_message_create` and `ai_engine_on_message_update`, which are called by AI::Engine whenever a new message on an AssistantThread belonging to the User (or whichever model includes Threadable) is created or updated. They can be used, for example, like this to broadcast changes over Hotwire:

```ruby
  def ai_engine_on_message_create(message:)
    broadcast_ai_response(message:)
  end

  def ai_engine_on_message_update(message:)
    broadcast_ai_response(message:)
  end

  def broadcast_ai_response(message:)
    broadcast_append_to(
      "#{dom_id(message.messageable)}_messages",
      partial: "messages/message",
      locals: {message: message, scroll_to: true},
      target: "#{dom_id(message.messageable)}_messages"
    )
  end
```

### Create Assistant Message & Run

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/jobs/create_assistant_message_and_run.rb)

Next we need a way to create messages and get a response from OpenAI. Generally it's recommended to do this in a background job, so that you can stream incremental updates for the best user experience. Here's an example:

```ruby
# app/jobs/create_assistant_message_and_run.rb
class CreateAssistantMessageAndRun < SidekiqJob
  def perform(args)
    storyteller_id, assistant_thread_id, user_id, content = args.values_at("storyteller_id", "assistant_thread_id", "user_id", "content")

    user = User.find(user_id)

    assistant_thread = user.assistant_threads.find(assistant_thread_id)
    storyteller = user.storytellers.find(storyteller_id)

    storyteller.ai_engine_run(assistant_thread: assistant_thread, content: content)
  end
end
```

`Storyteller#ai_engine_run` will create a response message with `role: "assistant"` and stream updates from OpenAI to it, triggering `User#ai_engine_on_message_create` and `User#ai_engine_on_message_update`, the latter once per chunk as it's received.

## User Interface [Optional]

That's the integration complete! The rest of this guide is optional and dependent on your app - it just represents 1 simple way to build a user interface for AI::Engine Assistants.

### Storyteller CRUD

We can now add a simple Storyteller resource. Each Storyteller will get a corresponding `AI::Engine::Assistant` created in the database, and a corresponding `Assistant` on the OpenAI API.

### Gemfile

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/Gemfile)

We're using these gems:

```ruby
# /Gemfile
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

## Use

In your app you should now be able to create a new `Storyteller` and a new `AssistantThread`, go to the `AssistantThread` show page and create and receive messages from the Assistant!

## Support

Any issues, please email me at `hello@alexrudall.com` and I'll respond ASAP.
