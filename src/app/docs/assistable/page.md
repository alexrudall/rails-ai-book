---
title: Assistable
nextjs:
  metadata:
    title: Assistable
    description: Coming soon.
---

This guide will walk you through adding streaming AI Assistants to your Rails app using [AI::Engine](https://insertrobot.com).

The guide includes the backend integration with AI::Engine, controllers and views to create Assistants, Threads, Runs and Messages, and various helpers to allow streaming of responses. It includes an abstraction called Storyteller, which is a model in your app that owns an assistant - it could be anything, eg. BusinessStrategy, RecipeMaker, etc.

![assistable-ui](/images/ai-engine/assistable/assistable-ui.png)

---

## Installation

First, install AI::Engine - [guide here](/docs/installation).

---

## Data Model

AI::Engine includes a `Assistable` module, the `AI::Engine::Assistant`, `AI::Engine::AssistantThread`, `AI::Engine::Run` and `AI::Engine::Message` classes and migrations to add these to your database.

The relations between these models and the methods added can be viewed in [this diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page). Red indicates code that will be added to your app via `include Assistable` and `include Threadable`, and blue code that is in the AI::Engine gem. Yellow text indicates relations between models in your app and models in AI::Engine.

## Assistants Integration

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

## Threads Integration
