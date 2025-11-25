import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { NotificationResponseDto } from '../notification/dto';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  role?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  // Map to track user connections (userId -> Set of socket ids)
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const authToken = client.handshake.auth?.token as string | undefined;
      const headerAuth = client.handshake.headers?.authorization;
      const token = authToken || headerAuth?.replace('Bearer ', '');

      if (token) {
        const payload = this.jwtService.verify<JwtPayload>(token);
        client.userId = payload.sub;
        client.username = payload.username;
        client.role = payload.role;

        // Join user-specific room for notifications
        void client.join(`user:${payload.sub}`);

        // Track socket connection for this user
        if (!this.userSockets.has(payload.sub)) {
          this.userSockets.set(payload.sub, new Set());
        }
        this.userSockets.get(payload.sub)?.add(client.id);

        this.logger.log(
          `Client connected: ${client.id} (User: ${client.username})`,
        );
      } else {
        this.logger.log(`Anonymous client connected: ${client.id}`);
      }
    } catch {
      this.logger.log(`Client connected without valid auth: ${client.id}`);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    // Remove from user sockets tracking
    if (client.userId) {
      const userSocketSet = this.userSockets.get(client.userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Join a product room to receive updates
  @SubscribeMessage('joinProduct')
  handleJoinProduct(
    @ConnectedSocket() client: Socket,
    @MessageBody() productId: string,
  ) {
    void client.join(`product:${productId}`);
    this.logger.log(`Client ${client.id} joined product:${productId}`);
    return { success: true, message: `Joined product ${productId}` };
  }

  // Leave a product room
  @SubscribeMessage('leaveProduct')
  handleLeaveProduct(
    @ConnectedSocket() client: Socket,
    @MessageBody() productId: string,
  ) {
    void client.leave(`product:${productId}`);
    this.logger.log(`Client ${client.id} left product:${productId}`);
    return { success: true, message: `Left product ${productId}` };
  }

  // Emit new review event
  emitNewReview(productId: string, review: any) {
    this.server.to(`product:${productId}`).emit('newReview', review);
  }

  // Emit review updated (like/dislike)
  emitReviewUpdated(productId: string, review: any) {
    this.server.to(`product:${productId}`).emit('reviewUpdated', review);
  }

  // Emit review deleted
  emitReviewDeleted(productId: string, reviewId: string) {
    this.server.to(`product:${productId}`).emit('reviewDeleted', { reviewId });
  }

  // Emit review hidden/shown
  emitReviewVisibilityChanged(
    productId: string,
    reviewId: string,
    isHidden: boolean,
  ) {
    this.server
      .to(`product:${productId}`)
      .emit('reviewVisibilityChanged', { reviewId, isHidden });
  }

  // Emit product reaction updated
  emitProductReactionUpdated(
    productId: string,
    data: { count: number; userId: string; reacted: boolean },
  ) {
    this.server.to(`product:${productId}`).emit('productReactionUpdated', data);
  }

  // Emit product saved/unsaved
  emitProductSavedUpdated(
    productId: string,
    data: { userId: string; saved: boolean },
  ) {
    this.server.to(`product:${productId}`).emit('productSavedUpdated', data);
  }

  // Emit notification to a specific user (grouped by userId to avoid duplicate notifications)
  emitNotification(userId: string, notification: NotificationResponseDto) {
    // Emit to user room - all sockets of this user will receive it
    // But we only emit once to the room, so each tab/window receives exactly one notification
    this.server.to(`user:${userId}`).emit('notification', notification);
    this.logger.log(
      `Notification sent to user ${userId}: ${notification.title}`,
    );
  }

  // Emit unread count update to a specific user
  emitUnreadCountUpdate(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('unreadCountUpdate', { count });
  }

  // Emit account banned event to a specific user
  emitAccountBanned(userId: string) {
    this.server.to(`user:${userId}`).emit('accountBanned');
    this.logger.log(`Account banned event sent to user ${userId}`);
  }

  // Emit notification deleted event (for unlike, unsave, etc.)
  emitNotificationDeleted(userId: string, notificationIds: string[]) {
    this.server
      .to(`user:${userId}`)
      .emit('notificationDeleted', { notificationIds });
    this.logger.log(
      `Notification deleted event sent to user ${userId}: ${notificationIds.length} notifications`,
    );
  }
}
