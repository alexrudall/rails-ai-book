---
title: Chattable
nextjs:
  metadata:
    title: Chattable
    description: Add OpenAI Chat to your Rails app.
---

This guide will walk you through adding a ChatGPT-like messaging stream to your Rails app using [AI::Engine](https://insertrobot.com).

---

## Installation

First, install AI::Engine - [guide here](/docs/installation).

## Data Model

AI::Engine includes a Chattable module, the AI::Engine::Chat and AI::Engine::Message classes and migrations to add these to your database.

The relations between these models and the methods added can be viewed in [this diagram](https://www.tldraw.com/ro/ytRoTCpPne2Tj2I4RW4KV?v=-103,-212,2203,1249&p=page). Red indcates code that will be added to your app via `include Chattable`, and blue code that is in the AI::Engine gem. Yellow text indicates relations between models in your app and models in AI::Engine.

## Integration

### Include Chattable

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/models/user.rb)

Add the Chattable module to the model that will 'own' Chats - probably the `User` model or similar.

```
class User < ApplicationRecord
  include AI::Engine::Chattable
  ...
```

This adds a new relation, so you can call `User.chats` and get a list of all AI::Engine::Chats belonging to a user.

It also adds 2 new callbacks methods, `ai_engine_on_message_create` and `ai_engine_on_message_update`, which are called by AI::Engine whenever a new message belonging to the User (or whichever model includes Chattable) is created or updated. They can be used, for example, like this to broadcast changes over Hotwire:

```
  def ai_engine_on_message_create(message:)
    broadcast_ai_response(message:)
  end

  def ai_engine_on_message_update(message:)
    broadcast_ai_response(message:)
  end
```

### Create Message & Run

[Click here to view in Starter Kit](https://github.com/alexrudall/ai-engine-starter-kit/blob/main/app/jobs/create_chat_message_and_stream.rb)

Next we need a way to create messages and get a response from OpenAI. Generally it's recommended to do this in a background job, so that you can stream incremental updates for the best user experience. Here's an example:

```
# app/jobs/create_chat_message_and_stream.rb
class CreateChatMessageAndStream < SidekiqJob
  def perform(args)
    chat_id, user_id, content, model = args.values_at("chat_id", "user_id", "content", "model")

    # Find the user.
    user = User.find(user_id)

    # Find the chat.
    chat = user.chats.find(chat_id)

    # Create the new user message.
    chat.messages.create(content: content, role: "user")

    # Get the response from OpenAI.
    chat.run(model: model)
  end
end
```

`Chat#run` will create a response message with `role: "assistant"` and stream updates from OpenAI to it, triggering `User#ai_engine_on_message_create` and `User#ai_engine_on_message_update`, the latter once per chunk as it's received.

## User Interface

We then just need a way to create the chats and messages and stream the response messages from the user. This UI

### Chats controller

In order to make chats available

### Chats views

## Messages controller

### UI: Create & Stream Messages
